#!/bin/bash
# Called by systemd ExecStopPost. Environment vars injected by systemd:
#   $SERVICE_RESULT: success | exit-code | signal | core-dump | watchdog | timeout
#   $EXIT_CODE:      exited | killed | dumped
#   $EXIT_STATUS:    numeric exit code or signal name

cd /home/zac/github.com/zapplebee/zapplebot

case "$SERVICE_RESULT" in
  success)
    # Clean stop (systemctl stop) — say nothing
    ;;
  exit-code)
    /home/zac/.bun/bin/bun run webhook.ts "⚠️ I crashed (exit code $EXIT_STATUS) and am restarting..."
    ;;
  signal)
    /home/zac/.bun/bin/bun run webhook.ts "⚠️ I was killed by signal $EXIT_STATUS and am restarting..."
    ;;
  core-dump)
    /home/zac/.bun/bin/bun run webhook.ts "💥 I crashed hard (core dump) and am restarting..."
    ;;
  *)
    /home/zac/.bun/bin/bun run webhook.ts "⚠️ I went down unexpectedly ($SERVICE_RESULT) and am restarting..."
    ;;
esac
