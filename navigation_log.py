#!/usr/bin/env python3

import argparse
import functools
import json
import os
import platform
import queue
import sqlite3
import struct
import sys
import threading
import time
import traceback

SCRIPT = os.path.realpath(__file__)
DIR = os.path.dirname(SCRIPT)

class PlatformWindows():
    def __init__(self):
        self.keyname = 'Software\\Mozilla\\NativeMessagingHosts\\navigation_log'
        self.jsonpath = os.path.realpath(os.path.join(DIR, 'navigation_log.json'))
        self.cmdpath = os.path.realpath(os.path.join(DIR, 'navigation_log.cmd'))

    def install(self):
        import winreg
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, self.keyname)
        winreg.SetValue(key, None, winreg.REG_SZ, self.jsonpath)

        f = open(self.cmdpath, 'w')
        f.write('@echo off\n')
        f.write(f'"{sys.executable}" "{SCRIPT}"\n')
        f.close()

        f = open(self.jsonpath, 'w')
        f.write(json.dumps({
            'name': 'navigation_log',
            'description': 'Store navigation events to an Sqlite database',
            'path': self.cmdpath,
            'type': 'stdio',
            'allowed_extensions': [ 'navigation_log@prekageo' ]
            }))
        f.close()

    def uninstall(self):
        import winreg
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, self.keyname)
        os.remove(self.jsonpath)
        os.remove(self.cmdpath)

def install():
    system = platform.system()
    if system == 'Windows':
        PlatformWindows().install()
    else:
        print(f'Unsupported platform {system}.', file=sys.stderr)
        print('See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests for implementation details.', file=sys.stderr)

def uninstall():
    system = platform.system()
    if system == 'Windows':
        PlatformWindows().uninstall()

def read_msg():
    length = sys.stdin.buffer.read(4)
    if len(length) == 0:
        return None
    length = struct.unpack('@I', length)[0]
    return json.loads(sys.stdin.buffer.read(length).decode('utf-8'))

def catch_exceptions(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except BaseException:
            exc_log = open('exception.log', 'a')
            traceback.print_exc(file=exc_log)
            exc_log.close()
    return wrapper

class DbThread(threading.Thread):
    def __init__(self):
        super().__init__()
        self.cmd_q = queue.Queue()

    @catch_exceptions
    def run(self):
        self.db = sqlite3.connect('log.sqlite')
        self.db.execute('create table if not exists log(timestamp, event, src_tab, dst_tab, src_url, dst_url, title, extra)')
        pending_commit = False
        while True:
            try:
                log = self.cmd_q.get(timeout=5 if pending_commit else None)
            except queue.Empty:
                pending_commit = False
                self.db.commit()
                continue
            if log is None:
                self.db.commit()
                break
            while len(log) < 8:
                log.append(None)
            log[7] = json.dumps(log[7])
            self.db.execute('insert into log values (?,?,?,?,?,?,?,?)', log)
            pending_commit = True

@catch_exceptions
def main_loop():
    os.chdir(DIR)

    db = DbThread()
    db.start()

    while True:
        msg = read_msg()
        db.cmd_q.put(msg)
        if msg is None:
            break

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--uninstall', action='store_true')
    args = parser.parse_args()

    if args.install:
        install()
    elif args.uninstall:
        uninstall()
    else:
        main_loop()

if __name__ == '__main__':
    main()
