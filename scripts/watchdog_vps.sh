#!/bin/sh
# Strażnik — strażnik usługi na VPS (audyt D1). Uruchamiany co minutę przez
# straznik-watchdog.timer. Gdy /api/health nie odpowiada dwa razy z rzędu,
# restartuje usługę. Pad samego procesu obsługuje już systemd (Restart=always);
# ten skrypt łapie proces, który żyje, ale nie odpowiada (zawieszona pętla).
STATE=/run/straznik-watchdog.fails
URL=http://127.0.0.1:40141/api/health

systemctl is-active --quiet straznik || exit 0

# świeżo uruchomiona usługa ma 2 min na rozgrzanie
since_us=$(systemctl show straznik -p ActiveEnterTimestampMonotonic --value)
uptime_s=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)
age=$(( uptime_s - since_us / 1000000 ))
[ "$age" -lt 120 ] && { rm -f "$STATE"; exit 0; }

if curl -fsS -m 10 -o /dev/null "$URL"; then
    rm -f "$STATE"
    exit 0
fi

fails=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE"
logger -t straznik-watchdog "/api/health nie odpowiada (${fails}. raz z rzędu)"
if [ "$fails" -ge 2 ]; then
    logger -t straznik-watchdog "restart usługi straznik"
    rm -f "$STATE"
    systemctl restart straznik
fi
