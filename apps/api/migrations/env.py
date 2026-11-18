from alembic import context

from markov_lab.persistence.db import database
from markov_lab.persistence.models import Base

if context.is_offline_mode():
    context.configure(url=database().url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with database().connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
