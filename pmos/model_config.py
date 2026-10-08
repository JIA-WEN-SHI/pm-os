"""Chat Completions configuration shared by the app and isolated acceptance tests."""
import os
from agno.models.openai import OpenAIChat


def configured_model():
    # Some OpenAI-compatible relays reject Agno's default system -> developer mapping.
    # Preserve the standard system role without changing the endpoint, key or model.
    return OpenAIChat(
        id=os.getenv('OPENAI_MODEL','gpt-4.1-mini'),
        base_url=os.getenv('OPENAI_BASE_URL') or None,
        role_map={'system':'system','user':'user','assistant':'assistant','tool':'tool','model':'assistant'},
    )
