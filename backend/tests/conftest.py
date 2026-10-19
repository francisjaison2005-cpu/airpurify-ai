import os
os.environ["TESTING"] = "true"
import pytest
from fastapi.testclient import TestClient
import mongomock

from backend.app.main import app
from backend.app.dependencies import get_database
from backend.app.database import setup_indexes_and_seed


@pytest.fixture
def mock_db():
    client = mongomock.MongoClient()
    db = client["airpurify_test_db"]
    setup_indexes_and_seed(db)
    return db


@pytest.fixture
def client(mock_db):
    def override_get_database():
        return mock_db

    app.dependency_overrides[get_database] = override_get_database
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
