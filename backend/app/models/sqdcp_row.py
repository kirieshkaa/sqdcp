from app import db


class SqdcpRow(db.Model):
    __tablename__ = "sqdcp_rows"

    id = db.Column(db.Integer, primary_key=True)
    board_id = db.Column(db.Integer, db.ForeignKey("boards.id"), nullable=False)
    team_name = db.Column(db.String(200), nullable=False)
    position = db.Column(db.Integer, default=0)
    safety = db.Column(db.Text, default="")
    quality = db.Column(db.Text, default="")
    delivery = db.Column(db.Text, default="")
    cost = db.Column(db.Text, default="")
    people = db.Column(db.Text, default="")
