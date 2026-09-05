"""Read public release/interest evidence. No sales claims and no external messages."""
from pathlib import Path
import hashlib,json,os,subprocess,tempfile
from interest_evidence import read_issues, summarize
repo=os.environ['REPO']
def api(endpoint):
    return json.loads(subprocess.check_output(['gh','api',endpoint],text=True))
releases=api(f'repos/{repo}/releases')
release=next((r for r in releases if not r['draft'] and r['tag_name']=='v0.1.0-preview'),None)
lines=['## Preview evidence','Automated engine checks passed. This is not a sales or browser-compatibility result.']
if release:
    asset=next(a for a in release['assets'] if a['name']=='CourseZip-Check-Free.html')
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(['gh','release','download','v0.1.0-preview','--repo',repo,'--pattern','CourseZip-Check-Free.html','--dir',folder],check=True)
        actual=hashlib.sha256((Path(folder)/'CourseZip-Check-Free.html').read_bytes()).hexdigest()
        expected=hashlib.sha256(Path('CourseZip-Check-Free.html').read_bytes()).hexdigest()
        if actual!=expected: raise SystemExit('Public release differs from the committed preview. Investigate before any sales.')
    lines += ['Public release download matches the committed artifact.',f"Platform download counter before this run: {asset['download_count']}. This includes our automated checks; it is not a buyer count."]
else:
    lines += ['No published preview yet; release delivery check deferred.']
interest=summarize(read_issues(repo),repo.split('/')[0])
lines += ['Interest evidence across all available issue pages: '+json.dumps(interest,sort_keys=True),
'Owner and recognized bot submissions are excluded from external-account counts; repeated submissions from one account count once. Distinct accounts are not verified independent people. Manual qualification must establish actual recurring work, relevant need and stated-price interest; these counts are not sales.',
'No external responses or insufficient qualified exposure is inconclusive, not evidence that nobody wants the product.',
'No checkout, receipts, payout status, or private customer content is accessed by this workflow.',
'Inspect in Actions. Stop by disabling this workflow. Recover a transient failure with a manual run; code failures require a fix.',
'Scheduled trigger registration does not prove a scheduled run has happened. Business adaptation and customer support are not automated by this workflow.']
Path(os.environ['GITHUB_STEP_SUMMARY']).write_text('\n\n'.join(lines)+'\n')
print('\n'.join(lines))
