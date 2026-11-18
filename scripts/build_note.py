"""Convert the paginated Ukrainian report source into an editable DOCX."""

import argparse
import re
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/reports"
SOURCE = REPORT / "explanatory-note.md"
CAPTURES = ROOT / "docs/screenshots"


def add_page_number(paragraph):
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    paragraph._p.append(field)


def set_style(style, size):
    style.font.name = "Times New Roman"
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0, 0, 0)
    fonts = style._element.get_or_add_rPr().rFonts
    for attribute in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme", "csTheme"):
        fonts.attrib.pop(qn(f"w:{attribute}"), None)
    fonts.set(qn("w:eastAsia"), "Times New Roman")
    fonts.set(qn("w:cs"), "Times New Roman")


def title_details(path):
    table = Document(path).tables[0]
    return {
        "university": "Київський національний університет імені Тараса Шевченка",
        "faculty": "Факультет інформаційних технологій · Кафедра програмних систем і технологій",
        "student": table.cell(1, 1).text.strip(),
        "group": table.cell(2, 1).text.strip(),
        "lecturer": "Ірина Юрчук",
        "city": "Київ",
    }


def add_title(document, details):
    def centered(text, before=0, after=0, bold=False, style="Normal"):
        p = document.add_paragraph(text, style)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Mm(0)
        p.paragraph_format.space_before = Pt(before)
        p.paragraph_format.space_after = Pt(after)
        p.runs[0].bold = bold

    centered(details.get("university", "[НАЗВА ЗАКЛАДУ ОСВІТИ]"))
    centered(details.get("faculty", "[ФАКУЛЬТЕТ / КАФЕДРА]"), before=6)
    centered("ПОЯСНЮВАЛЬНА ЗАПИСКА", before=110, after=15, bold=True, style="Title")
    centered("до індивідуального однокомпонентного STEM-проєкту", after=8)
    centered("ОЦІНКА НАДІЙНОСТІ ПРОГРАМНОЇ СИСТЕМИ\nНА ОСНОВІ МАРКІВСЬКИХ СТРУКТУР", before=20, after=14, bold=True)
    centered("Markov Reliability Lab", after=22)
    centered("Дисципліна «Методи тестування та оцінки\nнадійності програмних систем»")
    student = (
        f"Виконав {details['student']}" if "student" in details else "Виконав(ла) [ПІБ СТУДЕНТА]"
    )
    group = details.get("group", "[НОМЕР ГРУПИ]")
    lecturer = details.get("lecturer", "[ПІБ ВИКЛАДАЧА]")
    for index, label in enumerate((student, f"Група {group}", f"Викладач {lecturer}")):
        paragraph = document.add_paragraph(label)
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        paragraph.paragraph_format.space_before = Pt(55 if index == 0 else 0)
    centered(f"{details.get('city', '[МІСТО]')} 2026", before=85)


def add_contents(document, pages):
    for index, content in enumerate(pages[1:], 3):
        headings = [line for line in content.splitlines() if line.startswith("#")]
        for line in headings:
            name = line.lstrip("# ")
            paragraph = document.add_paragraph(style="ContentsItem")
            paragraph.paragraph_format.left_indent = Mm(6 if line.startswith("##") else 0)
            paragraph.add_run(name).bold = line.startswith("# ")
            paragraph.add_run(f"\t{index}")


def build(cover_template=None, output=REPORT / "explanatory-note.docx"):
    pages = SOURCE.read_text(encoding="utf-8").strip().split("\n---\n")
    document = Document()
    document.core_properties.title = "Оцінка надійності програмної системи на основі Марківських структур"
    document.core_properties.author = ""
    section = document.sections[0]
    section.page_width, section.page_height = Mm(210), Mm(297)
    section.left_margin, section.right_margin = Mm(23), Mm(15)
    section.top_margin, section.bottom_margin = Mm(20), Mm(20)
    section.footer_distance = Mm(10)
    section.different_first_page_header_footer = True

    for name in ("Normal", "Title", "Heading 1", "Heading 2", "Caption", "Footer"):
        set_style(document.styles[name], 14 if name in ("Title", "Heading 1") else 12)
    normal = document.styles["Normal"].paragraph_format
    normal.line_spacing = 1.25
    normal.first_line_indent = Mm(10)
    normal.space_after = Pt(6)
    for name in ("Title", "Heading 1", "Heading 2", "Caption"):
        style = document.styles[name]
        style.font.bold = name != "Caption"
        style.font.italic = False
        style.paragraph_format.first_line_indent = 0
        style.paragraph_format.space_before = Pt(0 if name == "Caption" else 3)
        style.paragraph_format.space_after = Pt(7)
        properties = style._element.get_or_add_pPr()
        for border in properties.findall(qn("w:pBdr")):
            properties.remove(border)
    contents = document.styles.add_style("ContentsItem", WD_STYLE_TYPE.PARAGRAPH)
    set_style(contents, 12)
    contents.paragraph_format.space_after = Pt(6)
    from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER

    contents.paragraph_format.tab_stops.add_tab_stop(Mm(170), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    add_page_number(footer)
    add_title(document, title_details(cover_template) if cover_template is not None else {})

    for content in pages:
        for line_index, line in enumerate(content.strip().splitlines()):
            if line == "@contents":
                add_contents(document, pages)
            elif line == "@test_summary":
                summary = (REPORT / "test-summary.txt").read_text(encoding="utf-8").strip()
                document.add_paragraph(summary)
            elif line.startswith("@image "):
                filename, caption, width = line[7:].split("|")
                paragraph = document.add_paragraph()
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                paragraph.paragraph_format.first_line_indent = 0
                paragraph.paragraph_format.space_after = Pt(3)
                paragraph.paragraph_format.keep_with_next = True
                paragraph.add_run().add_picture(str(CAPTURES / filename), width=Mm(float(width)))
                p = document.add_paragraph(caption, "Caption")
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            elif line.startswith("# "):
                paragraph = document.add_heading(line[2:], level=1)
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                paragraph.paragraph_format.page_break_before = line_index == 0
            elif line.startswith("## "):
                paragraph = document.add_heading(line[3:], level=2)
                paragraph.paragraph_format.page_break_before = line_index == 0
            elif line.startswith("= "):
                paragraph = document.add_paragraph(line[2:])
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                paragraph.paragraph_format.first_line_indent = 0
                paragraph.paragraph_format.space_after = Pt(3)
            elif line:
                paragraph = document.add_paragraph(line)
                if re.match(r"^\d+\. ", line):
                    paragraph.paragraph_format.first_line_indent = 0

    document.save(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cover-template", type=Path, help="Read student details from the university cover.")
    parser.add_argument("--output", type=Path, default=REPORT / "explanatory-note.docx")
    options = parser.parse_args()
    build(cover_template=options.cover_template, output=options.output)
