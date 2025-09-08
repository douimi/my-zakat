from flask_wtf import FlaskForm
from wtforms import (
    StringField,
    TextAreaField,
    IntegerField,
    FileField,
    SelectField,
    URLField,
)
from wtforms.validators import DataRequired, Length, NumberRange, Optional


class TestimonialForm(FlaskForm):
    name = StringField("Name", validators=[DataRequired(), Length(max=100)])
    country = StringField("Country", validators=[Optional(), Length(max=100)])
    image = FileField("Image (optional)")
    text = TextAreaField("Testimonial", validators=[DataRequired(), Length(max=1000)])
    rating = IntegerField(
        "Rating (1-5)", validators=[Optional(), NumberRange(min=1, max=5)]
    )
    video_url = URLField(
        "Video URL (optional)", validators=[Optional(), Length(max=255)]
    )
    category = SelectField(
        "Category",
        choices=[
            ("donor", "Donor"),
            ("recipient", "Recipient"),
            ("volunteer", "Volunteer"),
            ("other", "Other"),
        ],
        validators=[Optional()],
    )
