import json
import unittest

from runtime.executor_mesh.adapter import ProviderPermanentError
from runtime.executor_mesh.investigative_queue import validate_public_task_input
from runtime.investigative_mesh import InvestigativeChildSpec, build_public_mission


class InvestigativeLiveGateTests(unittest.TestCase):
    def test_mission_uses_bounded_investigative_profile(self):
        mission=build_public_mission("m1",[InvestigativeChildSpec("c1","TYPOLOGY_MATCHING",{"signals":["RF-1"]})])
        job=mission.children[0].job
        self.assertEqual(job.profile,"investigative-public-v0.1")
        self.assertEqual(job.privacy,"public")
        self.assertFalse(job.secrets_required)
        self.assertIn("os.linux",job.required_capabilities)

    def test_public_payload_rejects_secret_like_material(self):
        with self.assertRaises(ProviderPermanentError):
            validate_public_task_input({"token":"github_pat_not_allowed"})
        with self.assertRaises(ProviderPermanentError):
            validate_public_task_input({"nested":{"password":"x"}})

    def test_public_payload_is_bounded_and_json_safe(self):
        value=validate_public_task_input({"signals":["RF-1"],"typology_indicators":["RF-1"]})
        self.assertEqual(json.dumps(value,sort_keys=True),json.dumps({"signals":["RF-1"],"typology_indicators":["RF-1"]},sort_keys=True))


if __name__=="__main__":
    unittest.main()
