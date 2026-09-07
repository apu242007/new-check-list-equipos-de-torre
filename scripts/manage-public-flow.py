"""Deploy only this app's flow, keeping callback URLs outside the repository and logs."""
import json, os, pathlib, subprocess, sys

ROOT=pathlib.Path(__file__).resolve().parent.parent
PRIVATE=pathlib.Path(os.environ['LOCALAPPDATA'])/'CodexSharePointInspection'/'flows'
PRIVATE.mkdir(parents=True,exist_ok=True)
ENVIRONMENT='Default-2003cd32-a447-4e58-b7f9-ada4dc293241'
BASE=f'https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{ENVIRONMENT}/flows'
STATE=PRIVATE/'generic-v2.json'
env=dict(os.environ,AZURE_CONFIG_DIR=str(PRIVATE.parent/'azure'),PYTHONIOENCODING='utf-8')

def request(method,url,body=None):
    args=[sys.executable,'-m','azure.cli','rest','--method',method,'--resource','https://service.flow.microsoft.com/','--url',url,'--output','json']
    if body is not None:
        body_path=PRIVATE/'request-body.json';body_path.write_text(json.dumps(body),encoding='utf-8')
        args+=['--body','@'+str(body_path),'--headers','Content-Type=application/json']
    result=subprocess.run(args,env=env,capture_output=True,text=True,encoding='utf-8')
    if result.returncode:
        # Management errors do not include a signed callback request URL.
        print(result.stderr[:5000]);sys.exit(result.returncode)
    return json.loads(result.stdout) if result.stdout.strip() else {}

mode=sys.argv[1]
if mode=='deploy':
    source=json.loads((PRIVATE/'create.json').read_text(encoding='utf-8-sig'))
    definition=json.loads((ROOT/'power-automate'/'definition.json').read_text(encoding='utf-8'))
    properties={'displayName':'WellService | Checklist generico | Recepcion publica v2','definition':definition,'connectionReferences':source['properties']['connectionReferences'],'environment':{'name':ENVIRONMENT},'state':'Started'}
    if STATE.exists():
        saved=json.loads(STATE.read_text());flow_id=saved['flowId']
        result=request('PATCH',f'{BASE}/{flow_id}?api-version=2016-11-01',{'properties':properties})
    else:
        result=request('POST',f'{BASE}?api-version=2016-11-01',{'properties':properties})
        flow_id=result['name'];saved={'flowId':flow_id,'environment':ENVIRONMENT};STATE.write_text(json.dumps(saved),encoding='utf-8')
    callback=request('POST',f'{BASE}/{flow_id}/triggers/manual/listCallbackUrl?api-version=2016-11-01',{})
    saved['callbackUrl']=callback['response']['value'] if 'response' in callback else callback.get('value')
    if not saved['callbackUrl']:raise RuntimeError('No se recibió el endpoint del flujo.')
    STATE.write_text(json.dumps(saved),encoding='utf-8')
    print(json.dumps({'flowId':flow_id,'state':result.get('properties',{}).get('state'),'callbackStoredPrivately':True}))
elif mode=='build':
    saved=json.loads(STATE.read_text());build_env=dict(os.environ,TACKER_FLOW_URL=saved['callbackUrl'])
    subprocess.run(['node','scripts/build.mjs'],cwd=ROOT,env=build_env,check=True)
elif mode=='github-secret':
    saved=json.loads(STATE.read_text())
    subprocess.run(['gh','secret','set','TACKER_FLOW_URL','--repo','apu242007/new-check-list-equipos-de-torre'],input=saved['callbackUrl'],text=True,check=True)
    print('Endpoint de recepción configurado como secreto de compilación de GitHub.')
elif mode=='runs':
    saved=json.loads(STATE.read_text());data=request('GET',f"{BASE}/{saved['flowId']}/runs?api-version=2016-11-01&$top=5")
    print(json.dumps([{'name':r['name'],'status':r['properties'].get('status'),'start':r['properties'].get('startTime'),'error':r['properties'].get('error')} for r in data.get('value',[])],ensure_ascii=False))
else:raise RuntimeError('Modo desconocido.')
