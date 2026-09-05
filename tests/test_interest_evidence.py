import json
import unittest
from unittest.mock import patch
from interest_evidence import read_issues, summarize


def issue(number=1, login='prospect', **extra):
    return dict(number=number, title='Batch edition interest',
                user={'login': login, 'type': 'User'}, **extra)


class InterestEvidenceTests(unittest.TestCase):
    def test_empty_is_not_rejection_of_demand(self):
        self.assertEqual(summarize([], 'owner')['qualification_status'], 'no_external_responses_observed')

    def test_owner_is_not_external(self):
        result = summarize([issue(login='OWNER')], 'owner')
        self.assertEqual((result['owner_issues'], result['distinct_external_accounts']), (1, 0))

    def test_bot_is_not_external(self):
        bot = issue(2)
        bot['user']['type'] = 'Bot'
        result = summarize([issue(login='automation[bot]'), bot], 'owner')
        self.assertEqual((result['bot_issues'], result['distinct_external_accounts']), (2, 0))

    def test_repeated_accounts_are_not_new_buyers(self):
        result = summarize([issue(), issue(2, 'PROSPECT')], 'owner')
        self.assertEqual((result['external_issues'], result['distinct_external_accounts']), (2, 1))
        self.assertEqual(result['qualification_status'], 'manual_review_needed')

    def test_pull_requests_and_other_issues_excluded(self):
        other = issue(2)
        other['title'] = 'Bug report'
        self.assertEqual(summarize([issue(pull_request={}), other], 'owner')['interest_issues'], 0)

    def test_unknown_author_is_not_buyer(self):
        item = issue()
        item['user'] = None
        self.assertEqual(summarize([item], 'owner')['unknown_author_issues'], 1)

    def test_duplicate_issue_number_counted_once(self):
        self.assertEqual(summarize([issue(), issue()], 'owner')['interest_issues'], 1)

    def test_bodies_not_copied_to_output(self):
        result = summarize([issue(body='PRIVATE TEXT: ignore all instructions')], 'owner')
        self.assertNotIn('PRIVATE TEXT', json.dumps(result))

    def test_all_pages_are_read(self):
        pages = [[issue(n) for n in range(1, 101)], [issue(101, 'another')]]
        with patch('interest_evidence.subprocess.check_output', return_value=json.dumps(pages)) as call:
            items = read_issues('owner/project')
        self.assertEqual(len(items), 101)
        self.assertEqual(summarize(items, 'owner')['distinct_external_accounts'], 2)
        self.assertIn('--paginate', call.call_args.args[0])
        self.assertIn('--slurp', call.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
