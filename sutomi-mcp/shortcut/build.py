#!/usr/bin/env python3
"""Builds and signs `sutomi.shortcut`, the Siri Shortcut that talks to POST /voice.

Run on a Mac:  python3 shortcut/build.py
Signing needs a Mac that is signed into iCloud. dev.lan is not, so there set SIGN_HOST to an ssh
host that is (SIGN_HOST=devbook python3 shortcut/build.py): the unsigned file is copied over,
signed with `shortcuts sign --mode anyone`, and copied back.
Then AirDrop `shortcut/sutomi.shortcut` to the phone (or open it from Files) and tap Add Shortcut.
The token is NOT in the file: the first Text action holds a placeholder — open the shortcut on the
phone and paste the voice token there (ssh dedibox "grep ^SUTOMI_VOICE_TOKEN= /data/sutomi/.env").

What the shortcut does (see README.md): empty Conversation and Said; up to TURNS times, POST
{conversation_id, text} with the bearer token, remember reply and conversation_id, and if `next` is
"stop" show the reply (Siri speaks it) and stop, otherwise ask for input with the reply as the
prompt (Siri speaks it and listens) and send what was said as the next turn.
"""
import os
import pathlib
import plistlib
import subprocess
import sys
import uuid

URL = 'https://sutomi.net/voice'
TURNS = 8
TOKEN_PLACEHOLDER = 'PASTE-VOICE-TOKEN-HERE'
OBJ = '￼'  # the character a variable occupies inside a text field

def uid():
    return str(uuid.uuid4()).upper()

def action(ident, **params):
    return {'WFWorkflowActionIdentifier': ident, 'WFWorkflowActionParameters': params}

def output(u, name):  # magic variable: the output of an earlier action
    return {'Type': 'ActionOutput', 'OutputUUID': u, 'OutputName': name}

def variable(name):  # a named variable
    return {'Type': 'Variable', 'VariableName': name}

def attachment(ref):  # a field that holds exactly one variable
    return {'Value': ref, 'WFSerializationType': 'WFTextTokenAttachment'}

def text(string, *refs):  # a text field; each OBJ in `string` is the next ref in order
    ranges, pos = {}, -1
    for ref in refs:
        pos = string.index(OBJ, pos + 1)
        ranges[f'{{{pos}, 1}}'] = ref
    return {'Value': {'string': string, 'attachmentsByRange': ranges}, 'WFSerializationType': 'WFTextTokenString'}

def dictionary(items):  # key → text field, for headers and the JSON body
    return {'Value': {'WFDictionaryFieldValueItems': [{'WFItemType': 0, 'WFKey': text(k), 'WFValue': v} for k, v in items.items()]},
            'WFSerializationType': 'WFDictionaryFieldValue'}

def set_variable(name, ref):
    return action('is.workflow.actions.setvariable', WFVariableName=name, WFInput=attachment(ref))

def get_value(key, source_uuid, out_uuid):
    return action('is.workflow.actions.getvalueforkey', UUID=out_uuid, WFGetDictionaryValueType='Value',
                  WFDictionaryKey=key, WFInput=attachment(output(source_uuid, 'Contents of URL')))

def build():
    token, empty, repeat, url, reply, cid, nxt, nxt_text, cond, ask = (uid() for _ in range(10))
    return [
        action('is.workflow.actions.comment', WFCommentActionText='sutomi voice: paste the voice token into the Text box below (replace the placeholder). Nothing else needs changing.'),
        action('is.workflow.actions.gettext', UUID=token, WFTextActionText=TOKEN_PLACEHOLDER),
        action('is.workflow.actions.gettext', UUID=empty, WFTextActionText=''),
        set_variable('Conversation', output(empty, 'Text')),
        set_variable('Said', output(empty, 'Text')),
        action('is.workflow.actions.repeat.count', GroupingIdentifier=repeat, WFControlFlowMode=0, WFRepeatCount=TURNS),
        action('is.workflow.actions.downloadurl', UUID=url, WFURL=URL, WFHTTPMethod='POST', WFHTTPBodyType='JSON', ShowHeaders=True, Advanced=True,
               WFHTTPHeaders=dictionary({'Authorization': text('Bearer ' + OBJ, output(token, 'Text'))}),
               WFJSONValues=dictionary({'conversation_id': text(OBJ, variable('Conversation')), 'text': text(OBJ, variable('Said'))})),
        get_value('reply', url, reply),
        set_variable('Reply', output(reply, 'Dictionary Value')),
        get_value('conversation_id', url, cid),
        set_variable('Conversation', output(cid, 'Dictionary Value')),
        get_value('next', url, nxt),
        # The If must see Text, not an untyped dictionary value, or it only offers "has any value".
        action('is.workflow.actions.gettext', UUID=nxt_text, WFTextActionText=text(OBJ, output(nxt, 'Dictionary Value'))),
        action('is.workflow.actions.conditional', GroupingIdentifier=cond, WFControlFlowMode=0, WFCondition=4, WFConditionalActionString='stop',
               WFInput={'Type': 'Variable', 'Variable': attachment(output(nxt_text, 'Text'))}),
        action('is.workflow.actions.showresult', Text=text(OBJ, variable('Reply'))),
        action('is.workflow.actions.exit'),
        action('is.workflow.actions.conditional', GroupingIdentifier=cond, WFControlFlowMode=1),
        action('is.workflow.actions.ask', UUID=ask, WFInputType='Text', WFAskActionPrompt=text(OBJ, variable('Reply'))),
        set_variable('Said', output(ask, 'Provided Input')),
        action('is.workflow.actions.conditional', GroupingIdentifier=cond, WFControlFlowMode=2),
        action('is.workflow.actions.repeat.count', GroupingIdentifier=repeat, WFControlFlowMode=2),
    ]

def sign(unsigned, signed):
    host = os.environ.get('SIGN_HOST')
    cmd = ['shortcuts', 'sign', '--mode', 'anyone', '--input', unsigned.name, '--output', signed.name]
    if not host:
        return subprocess.run(cmd, cwd=unsigned.parent, capture_output=True, text=True)
    subprocess.run(['ssh', host, 'mkdir -p tmp/sutomi-shortcut && rm -f tmp/sutomi-shortcut/*.shortcut'], check=True)
    subprocess.run(['scp', '-q', str(unsigned), f'{host}:tmp/sutomi-shortcut/'], check=True)
    r = subprocess.run(['ssh', host, 'cd tmp/sutomi-shortcut && ' + ' '.join(cmd)], capture_output=True, text=True)
    if r.returncode == 0:
        subprocess.run(['scp', '-q', f'{host}:tmp/sutomi-shortcut/{signed.name}', str(signed)], check=True)
    return r

def main():
    here = pathlib.Path(__file__).resolve().parent
    workflow = {
        'WFWorkflowActions': build(),
        'WFWorkflowClientVersion': '5114.0.6.204',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': 4282601983, 'WFWorkflowIconGlyphNumber': 59511},
        'WFWorkflowImportQuestions': [],
        'WFWorkflowInputContentItemClasses': [],
        'WFWorkflowTypes': [],
        'WFWorkflowHasShortcutInputVariables': False,
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowOutputContentItemClasses': [],
        'WFQuickActionSurfaces': [],
    }
    unsigned = here / 'sutomi.unsigned.shortcut'
    signed = here / 'sutomi.shortcut'
    unsigned.write_bytes(plistlib.dumps(workflow))
    if signed.exists():
        signed.unlink()
    r = sign(unsigned, signed)
    if r.returncode != 0:
        print(r.stdout, r.stderr, file=sys.stderr)
        sys.exit(f'signing failed; the unsigned file is at {unsigned}')
    unsigned.unlink()
    print(f'signed: {signed} ({signed.stat().st_size} bytes)')

if __name__ == '__main__':
    main()
