from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:password@db:5432/myzakat"
)

# Optimize database connection pooling for high concurrency
engine = create_engine(
    DATABASE_URL,
    pool_size=20,  # Number of connections to maintain in the pool
    max_overflow=40,  # Maximum number of connections that can be created beyond pool_size
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,  # Recycle connections after 1 hour to prevent stale connections
    connect_args={
        "connect_timeout": 10,  # Connection timeout in seconds
        "application_name": "myzakat_backend"
    }
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
