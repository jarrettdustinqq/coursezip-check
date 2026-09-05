"""Aggregate public responses, not buyers. Never execute or echo issue bodies."""
import json
import subprocess


def read_issues(repo):
    pages = json.loads(subprocess.check_output(
        ['gh', 'api', '--paginate', '--slurp',
         f'repos/{repo}/issues?state=all&per_page=100'], text=True))
    return [issue for page in pages for issue in page]


def summarize(issues, owner):
    seen_issues = set()
    external_accounts = set()
    counts = dict(interest_issues=0, owner_issues=0, bot_issues=0,
                  unknown_author_issues=0, external_issues=0)
    for issue in issues:
        if 'pull_request' in issue or not issue.get('title', '').startswith('Batch edition interest'):
            continue
        number = issue['number']
        if number in seen_issues:
            continue
        seen_issues.add(number)
        counts['interest_issues'] += 1
        user = issue.get('user') or {}
        login = (user.get('login') or '').casefold()
        if not login:
            counts['unknown_author_issues'] += 1
        elif login == owner.casefold():
            counts['owner_issues'] += 1
        elif user.get('type') == 'Bot' or login.endswith('[bot]'):
            counts['bot_issues'] += 1
        else:
            counts['external_issues'] += 1
            external_accounts.add(login)
    counts['distinct_external_accounts'] = len(external_accounts)
    counts['qualification_status'] = 'manual_review_needed' if external_accounts else 'no_external_responses_observed'
    # Distinct accounts are not necessarily distinct people or independent buyers.
    # Do not infer qualified demand, willingness to pay, or revenue from this count.
    return counts
