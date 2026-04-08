"""This module defines the persisted study-session entities so live load data, generated questions, answers, and band transitions can be reconstructed after the app restarts."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from db.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    doc_id = Column(String, ForeignKey("documents.id"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, default="active", nullable=False, index=True)
    pomodoro_length = Column(Integer, default=25, nullable=False)

    document = relationship("Document", back_populates="sessions")
    load_events = relationship("LoadEvent", back_populates="session", cascade="all, delete-orphan")
    questions = relationship("Question", back_populates="session", cascade="all, delete-orphan")
    answers = relationship("Answer", back_populates="session", cascade="all, delete-orphan")
    band_changes = relationship("BandChange", back_populates="session", cascade="all, delete-orphan")
    self_report_ratings = relationship("SelfReportRating", back_populates="session", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    chunk_count = Column(Integer, default=0, nullable=False)
    chroma_path = Column(String, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    sessions = relationship("Session", back_populates="document")
    questions = relationship("Question", back_populates="document")


class LoadEvent(Base):
    __tablename__ = "load_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    keystroke_score = Column(Float, nullable=True)
    face_score = Column(Float, nullable=True)
    latency_score = Column(Float, nullable=True)
    composite_score = Column(Float, nullable=False)
    band = Column(String, nullable=False, index=True)
    signals_active = Column(JSON, nullable=False, default=list)

    session = relationship("Session", back_populates="load_events")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    doc_id = Column(String, ForeignKey("documents.id"), nullable=True, index=True)
    text = Column(Text, nullable=False)
    band = Column(String, nullable=False, index=True)
    load_at_time = Column(Float, nullable=False)
    asked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    hint = Column(Text, nullable=True)
    
    options = Column(JSON, nullable=True)                 
    correct_answer = Column(String, nullable=True)        
    explanation = Column(Text, nullable=True)

    # Spaced-repetition scheduling fields
    next_review_at = Column(Integer, nullable=True)       # Unix timestamp of next scheduled review
    was_correct = Column(Boolean, nullable=True)          # Whether the latest answer was correct
    review_count = Column(Integer, default=0)             # how many times this question has been reviewed

    session = relationship("Session", back_populates="questions")
    document = relationship("Document", back_populates="questions")
    answers = relationship("Answer", back_populates="question", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False, index=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    answer_text = Column(Text, nullable=False)
    latency_ms = Column(Integer, nullable=False)
    correct = Column(Boolean, nullable=False)
    score = Column(Float, nullable=False)

    question = relationship("Question", back_populates="answers")
    session = relationship("Session", back_populates="answers")


class BandChange(Base):
    __tablename__ = "band_changes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    from_band = Column(String, nullable=True)
    to_band = Column(String, nullable=False)
    trigger_score = Column(Float, nullable=False)
    reason = Column(String, nullable=False)

    session = relationship("Session", back_populates="band_changes")


class SelfReportRating(Base):
    """Stores a single NASA-TLX self-report snapshot submitted by the learner."""

    __tablename__ = "self_report_ratings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    question_number = Column(Integer, nullable=False)  # after which answered question this was triggered
    mental_demand = Column(Integer, nullable=False)
    physical_demand = Column(Integer, nullable=False)
    temporal_demand = Column(Integer, nullable=False)
    performance = Column(Integer, nullable=False)
    effort = Column(Integer, nullable=False)
    frustration = Column(Integer, nullable=False)
    single_scale_overall = Column(Integer, nullable=False)
    composite_load_at_time = Column(Float, nullable=False, default=0.0)  # CLB composite score snapshot

    session = relationship("Session", back_populates="self_report_ratings")
