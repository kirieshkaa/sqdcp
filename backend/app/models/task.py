from app import db


class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    board_id = db.Column(db.Integer, db.ForeignKey("boards.id"), nullable=True)
    row_id = db.Column(db.Integer, db.ForeignKey("sqdcp_rows.id"), nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    project_id = db.Column(db.Integer, db.ForeignKey("department_projects.id"), nullable=True)
    column_key = db.Column(db.String(20), default="")
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default="")
    assignees = db.Column(db.Text, default="")
    status = db.Column(db.String(20), default="not_started")
    due_date = db.Column(db.String(10), default="")
