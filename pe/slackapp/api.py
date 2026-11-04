"""Thin Slack Web API client (only the calls this app needs) and a fake for tests.

Least-privilege bot scopes this needs: chat:write, im:history, im:read, users:read,
channels:read and groups:read (to list members of configured channels only),
channels:history / groups:history only if company channels are enabled. No admin scopes,
no files:read in this slice (attachment metadata comes from the event itself).
The bot token is read from SLACK_BOT_TOKEN and never stored in the database or logs.
"""
import json
import os
import urllib.request


class SlackAPI:
    BASE = "https://slack.com/api/"

    def __init__(self, token=None):
        self.token = token or os.environ["SLACK_BOT_TOKEN"]

    def _call(self, method, **params):
        req = urllib.request.Request(self.BASE + method, data=json.dumps(params).encode(),
                                     headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        if not data.get("ok"):
            raise RuntimeError(f"Slack {method} failed: {data.get('error')}")
        return data

    def conversation_info(self, channel):
        return self._call("conversations.info", channel=channel)["channel"]

    def members(self, channel):
        out, cursor = [], None
        while True:
            d = self._call("conversations.members", channel=channel, cursor=cursor) if cursor else self._call("conversations.members", channel=channel)
            out += d["members"]
            cursor = d.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                return out

    def user_info(self, user):
        return self._call("users.info", user=user)["user"]

    def post(self, channel, text, thread_ts=None, client_msg_id=None):
        return self._call("chat.postMessage", channel=channel, text=text, thread_ts=thread_ts)["ts"]


class FakeSlack:
    """In-memory workspace for tests. Holds channels, members and users, and records posts."""

    def __init__(self, bot_user="UBOT", team="T1"):
        self.bot_user, self.team = bot_user, team
        self.channels, self.users, self.posted = {}, {}, []

    def add_user(self, uid, team=None, guest=False, bot=False):
        self.users[uid] = {"id": uid, "team_id": team or self.team, "is_restricted": guest,
                           "is_ultra_restricted": False, "is_bot": bot, "is_stranger": (team or self.team) != self.team}

    def add_channel(self, cid, members, is_im=False, ext_shared=False):
        self.channels[cid] = {"id": cid, "is_im": is_im, "is_ext_shared": ext_shared, "members": list(members)}

    def conversation_info(self, channel):
        return self.channels[channel]

    def members(self, channel):
        return list(self.channels[channel]["members"])

    def user_info(self, user):
        return self.users.get(user, {"id": user, "team_id": "UNKNOWN", "is_restricted": True, "is_stranger": True, "is_bot": False})

    def post(self, channel, text, thread_ts=None, client_msg_id=None):
        self.posted.append({"channel": channel, "text": text, "thread_ts": thread_ts})
        return f"ts{len(self.posted)}"
