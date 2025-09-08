"""merge all heads

Revision ID: 4d3ca535efed
Revises: 20250529_add_video_url_to_story, 2186f3454dac
Create Date: 2025-05-29 05:46:39.227105

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4d3ca535efed'
down_revision = ('20250529_add_video_url_to_story', '2186f3454dac')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
