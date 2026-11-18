"""Exports use the immutable run result and the exact revision attached to it."""

import io
import os
from pathlib import Path

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from markov_lab.domain.models import AnalysisResult, AnalysisSettings


def matrix_csv(result: AnalysisResult, kind: str) -> str:
    rows = pd.DataFrame(result.matrix, index=result.states, columns=result.states)
    rows.insert(0, "p0", result.initial)
    return str(rows.to_csv(index_label=kind.upper(), float_format="%.17g"))


def series_csv(result: AnalysisResult) -> str:
    rows = []
    for point in result.series:
        row = point.model_dump(exclude={"distribution"})
        row.update({f"p({s})": v for s, v in zip(result.states, point.distribution, strict=True)})
        rows.append(row)
    return str(pd.DataFrame(rows).to_csv(index=False, float_format="%.17g"))


def run_pdf(result: AnalysisResult, options: AnalysisSettings, identifier: str) -> bytes:
    font_paths = (
        os.environ.get("REPORT_FONT", ""),
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    )
    font = next((path for path in font_paths if path and Path(path).is_file()), None)
    if font is None:
        labels = ("Reliability", "Success", "Failure", "Running")
        heading = "Analysis report"
        state_header = "State / initial / first hit / expected visits"
        page_prefix = "Page"
        regular = "Helvetica"
    else:
        regular = "LabSans"
        if regular not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(regular, font))
        labels = ("Надійність", "Успіх", "Відмова", "Виконання триває")
        heading = "Звіт про аналіз"
        state_header = "Стан / початкова імовірність / перше досягнення / відвідування"
        page_prefix = "Сторінка"
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    pdf.setTitle("Markov Reliability Lab")
    pdf.setFont(regular, 21)
    pdf.drawString(50, 778, heading)
    pdf.setFont(regular, 10)
    pdf.drawString(50, 748, f"Markov Reliability Lab | {identifier}")
    point = result.series[-1]
    pdf.drawString(50, 728, f"{options.kind.upper()}   |   t/k = {point.time:g}")
    for index, (label, value) in enumerate(
        zip(labels, (point.reliability, point.success, point.failure, point.running), strict=True)
    ):
        pdf.drawString(50, 692 - 22 * index, label)
        pdf.drawRightString(545, 692 - 22 * index, f"{value:.10f}")
    position = 575
    pdf.drawString(50, position, state_header)
    for metric in result.metrics:
        position -= 15
        pdf.drawString(50, position, metric.id)
        pdf.drawRightString(340, position, f"{metric.initial:.6f}")
        pdf.drawRightString(445, position, f"{metric.first_hit:.6f}")
        visits = "—" if metric.expected_visits is None else f"{metric.expected_visits:.6g}"
        pdf.drawRightString(545, position, visits)
    pdf.drawRightString(545, 40, f"{page_prefix} 1")
    pdf.save()
    return buf.getvalue()
