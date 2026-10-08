import unittest
from unittest.mock import patch
from agno.models.message import Message
from pmos.model_config import configured_model

class ModelConfigTests(unittest.TestCase):
    def test_relay_uses_system_role_and_preserves_other_message_roles(self):
        with patch.dict('os.environ',{'OPENAI_MODEL':'test-model','OPENAI_BASE_URL':'https://relay.example/v1'}):
            model=configured_model()
        self.assertEqual(model.id,'test-model')
        self.assertEqual(model.base_url,'https://relay.example/v1')
        for role in ('system','user','assistant','tool'):
            self.assertEqual(model._format_message(Message(role=role,content='text'))['role'],role)
