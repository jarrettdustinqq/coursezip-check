"""Read public release/interest evidence. No sales claims and no external messages."""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile
from interest_evidence import read_issues, summarize
repo=os.environ['REPO']
def api(endpoint):
    return json.loads(subprocess.check_output(['gh','api',endpoint],text=True))
release_tag='v0.1.1-preview'
release=api(f'repos/{repo}/releases/tags/{release_tag}')
lines=['## Preview evidence','Automated engine checks passed. This is not a sales or browser-compatibility result.']
if not release['draft'] and release['tag_name']==release_tag:
    asset=next(a for a in release['assets'] if a['name']=='CourseZip-Check-Free.html')
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(['gh','release','download',release_tag,'--repo',repo,'--pattern','CourseZip-Check-Free.html','--dir',folder],check=True)
        actual=hashlib.sha256((Path(folder)/'CourseZip-Check-Free.html').read_bytes()).hexdigest()
        expected=hashlib.sha256(Path('CourseZip-Check-Free.html').read_bytes()).hexdigest()
        if actual!=expected: raise SystemExit('Public release differs from the committed preview. Investigate before any sales.')
    lines += ['Public release download matches the committed artifact.',f"Platform download counter before this run: {asset['download_count']}. This includes our automated checks; it is not a buyer count."]
else:
    raise SystemExit(f'Expected published release {release_tag}; release delivery check failed.')
interest=summarize(read_issues(repo),repo.split('/')[0])
try:
    proposal=api('repos/moosensei/awesome-moodle/pulls/8')
    placement='merged' if proposal.get('merged') else proposal.get('state','unknown')
except (subprocess.CalledProcessError, json.JSONDecodeError):
    placement='unavailable; retry the public status check later'
lines += [f'Directory contribution: https://github.com/moosensei/awesome-moodle/pull/8 — {placement}. '
          'This records review/placement status only, not qualified exposure, demand or sales. No messages are sent.']
lines += ['Interest evidence across all available issue pages: '+json.dumps(interest,sort_keys=True),
'Owner and recognized bot submissions are excluded from external-account counts; repeated submissions from one account count once. Distinct accounts are not verified independent people. Manual qualification must establish actual recurring work, relevant need and stated-price interest; these counts are not sales.',
'No external responses or insufficient qualified exposure is inconclusive, not evidence that nobody wants the product.',
'No checkout, receipts, payout status, or private customer content is accessed by this workflow.',
'Inspect in Actions. Stop by disabling this workflow. Recover a transient failure with a manual run; code failures require a fix.',
'Scheduled trigger registration does not prove a scheduled run has happened. Business adaptation and customer support are not automated by this workflow.']
Path(os.environ['GITHUB_STEP_SUMMARY']).write_text('\n\n'.join(lines)+'\n')
print('\n'.join(lines))
