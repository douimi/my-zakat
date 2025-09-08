"""add video_url to Story model

Revision ID: 20250529_add_video_url_to_story
Revises: bca9cda49168
Create Date: 2025-05-29

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250529_add_video_url_to_story"
down_revision = "bca9cda49168"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("story", schema=None) as batch_op:
        batch_op.add_column(sa.Column("video_url", sa.String(length=255)))


def downgrade():
    with op.batch_alter_table("story", schema=None) as batch_op:
        batch_op.drop_column("video_url")
