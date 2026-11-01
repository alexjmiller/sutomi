#!/usr/bin/env python3
"""Builds and signs the Siri Shortcuts that talk to POST /voice — one per job (SHORTCUTS below):
each sends its `mode` on every call, so the service opens with that job's question and keeps to it.

Run on a Mac:  python3 shortcut/build.py
Signing needs a Mac that is signed into iCloud. dev.lan is not, so there set SIGN_HOST to an ssh
host that is (SIGN_HOST=devbook python3 shortcut/build.py): the unsigned file is copied over,
signed with `shortcuts sign --mode anyone`, and copied back.
Then AirDrop the `shortcut/*.shortcut` files to the phone (or open them from Files) and tap Add
Shortcut. The token is NOT in the files: the first Text action holds a placeholder — open each
shortcut on the phone and paste the voice token there (ssh dedibox "grep ^SUTOMI_VOICE_TOKEN=
/data/sutomi/.env"). A shortcut is run by saying its name to Siri; rename it on the phone if Siri
keeps answering with its own Calendar or Reminders instead.

What a shortcut does (see README.md): empty Conversation and Said, Finished = no; up to TURNS
times while Finished is no: POST {conversation_id, text, mode} with the bearer token, remember reply
and conversation_id, and if `next` is "stop" set Finished = yes, otherwise ask for input with the
reply as the prompt (Siri speaks it and listens) and send what was said as the next turn. After the
loop, show the reply — the last action, so Siri speaks it and does not add "That's done" (which it
says after a Stop action).
"""
import os
import pathlib
import plistlib
import subprocess
import sys
import uuid

URL = 'https://sutomi.net/voice'
SHORTCUTS = [  # (name as said to Siri, mode)
    ('create a task', 'task'),
    ('create an event', 'event'),
    ('tell me about my tasks', 'tasks'),
    ('tell me about my events', 'events'),
]
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

def build(mode):
    token, empty, no, yes, repeat, url, reply, cid, nxt, nxt_text, guard, cond, ask = (uid() for _ in range(13))
    named = lambda name: {'Type': 'Variable', 'Variable': attachment(variable(name))}  # an If over a named variable
    return [
        action('is.workflow.actions.comment', WFCommentActionText=f'sutomi voice ({mode}): paste the voice token into the Text box below (replace the placeholder). Nothing else needs changing.'),
        action('is.workflow.actions.gettext', UUID=token, WFTextActionText=TOKEN_PLACEHOLDER),
        action('is.workflow.actions.gettext', UUID=empty, WFTextActionText=''),
        set_variable('Conversation', output(empty, 'Text')),
        set_variable('Said', output(empty, 'Text')),
        action('is.workflow.actions.gettext', UUID=no, WFTextActionText='no'),
        set_variable('Finished', output(no, 'Text')),
        action('is.workflow.actions.repeat.count', GroupingIdentifier=repeat, WFControlFlowMode=0, WFRepeatCount=TURNS),
        # Nothing may stop the shortcut early: Siri says "That's done" after a Stop action. Once the
        # reply says stop, Finished turns the remaining turns into no-ops and the loop runs out.
        action('is.workflow.actions.conditional', GroupingIdentifier=guard, WFControlFlowMode=0, WFCondition=4, WFConditionalActionString='no', WFInput=named('Finished')),
        action('is.workflow.actions.downloadurl', UUID=url, WFURL=URL, WFHTTPMethod='POST', WFHTTPBodyType='JSON', ShowHeaders=True, Advanced=True,
               WFHTTPHeaders=dictionary({'Authorization': text('Bearer ' + OBJ, output(token, 'Text'))}),
               WFJSONValues=dictionary({'conversation_id': text(OBJ, variable('Conversation')), 'text': text(OBJ, variable('Said')), 'mode': text(mode)})),
        get_value('reply', url, reply),
        set_variable('Reply', output(reply, 'Dictionary Value')),
        get_value('conversation_id', url, cid),
        set_variable('Conversation', output(cid, 'Dictionary Value')),
        get_value('next', url, nxt),
        # The If must see Text, not an untyped dictionary value, or it only offers "has any value".
        action('is.workflow.actions.gettext', UUID=nxt_text, WFTextActionText=text(OBJ, output(nxt, 'Dictionary Value'))),
        action('is.workflow.actions.conditional', GroupingIdentifier=cond, WFControlFlowMode=0, WFCondition=4, WFConditionalActionString='stop',
               WFInput={'Type': 'Variable', 'Variable': attachment(output(nxt_text, 'Text'))}),
        action('is.workflow.actions.gettext', UUID=yes, WFTextActionText='yes'),
        set_variable('Finished', output(yes, 'Text')),
        action('is.workflow.actions.conditional', GroupingIdentifier=cond, WFControlFlowMode=1),
        action('is.workflow.actions.ask', UUID=ask, WFInputType='Text', WFAskActionPrompt=text(OBJ, variable('Reply'))),
        set_variable('Said', output(ask, 'Provided Input')),
        action('is.workflow.actions.conditional', GroupingIdentifier=cond, WFControlFlowMode=2),
        action('is.workflow.actions.conditional', GroupingIdentifier=guard, WFControlFlowMode=2),
        action('is.workflow.actions.repeat.count', GroupingIdentifier=repeat, WFControlFlowMode=2),
        # Last action = the spoken result, so the shortcut ends on it and Siri adds nothing.
        action('is.workflow.actions.showresult', Text=text(OBJ, variable('Reply'))),
    ]

def sign(unsigned, signed):
    host = os.environ.get('SIGN_HOST')
    cmd = ['shortcuts', 'sign', '--mode', 'anyone', '--input', unsigned.name, '--output', signed.name]
    if not host:
        return subprocess.run(cmd, cwd=unsigned.parent, capture_output=True, text=True)
    import shlex
    subprocess.run(['ssh', host, 'mkdir -p tmp/sutomi-shortcut && rm -f tmp/sutomi-shortcut/*.shortcut'], check=True)
    subprocess.run(['scp', '-q', str(unsigned), f'{host}:tmp/sutomi-shortcut/'], check=True)
    r = subprocess.run(['ssh', host, 'cd tmp/sutomi-shortcut && ' + ' '.join(shlex.quote(c) for c in cmd)], capture_output=True, text=True)
    if r.returncode == 0:
        subprocess.run(['scp', '-q', f'{host}:tmp/sutomi-shortcut/{signed.name}', str(signed)], check=True)
    return r

def main():
    here = pathlib.Path(__file__).resolve().parent
    for name, mode in SHORTCUTS:
        workflow = {
            'WFWorkflowActions': build(mode),
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
        unsigned = here / f'{name}.unsigned.shortcut'
        signed = here / f'{name}.shortcut'
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
