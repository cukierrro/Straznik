#!/bin/sh
# Strażnik — strażnik usług na VPS (audyt D1). Uruchamiany co minutę przez
# straznik-watchdog.timer. Gdy usługa nie odpowiada dwa razy z rzędu,
# restartuje ją. Pad samego procesu obsługuje już systemd (Restart=always);
# ten skrypt łapie proces, który żyje, ale nie odpowiada (zawieszona pętla).
# Od rozbicia na dwa procesy (20.09.2026) pilnujemy obu. Reader podaje stronę
# wszystkim telefonom, więc jego zawieszenie to cisza dla ludzi, choć alarm
# dalej się liczy; writer to sam alarm. Każdy ma własny licznik nieudanych prób.
pilnuj() {
    usluga=$1
    url=$2
    stan=/run/straznik-watchdog.$usluga

    systemctl is-active --quiet "$usluga" || return 0

    # Świeżo uruchomiona usługa ma 2 min na rozgrzanie.
    #
    # Liczymy to zegarem ściennym, nie monotonicznym. VPS jest kontenerem: zegar
    # monotoniczny systemd idzie od startu GOSPODARZA (47 dni), a /proc/uptime
    # pokazuje kontener (2,8 dnia). Różnica wychodziła ujemna, więc dozorca zawsze
    # sądził, że usługa dopiero wstaje, i NIGDY nikogo nie podniósł — od 17.09 był
    # ozdobą. Wyszło dopiero przy próbie na atrapie 20.09.
    od=$(date -d "$(systemctl show "$usluga" -p ActiveEnterTimestamp --value)" +%s 2>/dev/null)
    # gdy daty nie da się odczytać, uznajemy usługę za rozgrzaną: lepiej zrestartować
    # zdrową usługę o jeden raz za dużo niż nie restartować jej nigdy
    if [ -n "$od" ]; then
        age=$(( $(date +%s) - od ))
        [ "$age" -lt 120 ] && { rm -f "$stan"; return 0; }
    fi

    if curl -fsS -m 10 -o /dev/null "$url"; then
        rm -f "$stan"
        return 0
    fi

    fails=$(( $(cat "$stan" 2>/dev/null || echo 0) + 1 ))
    echo "$fails" > "$stan"
    logger -t straznik-watchdog "$usluga: $url nie odpowiada (${fails}. raz z rzędu)"
    if [ "$fails" -ge 2 ]; then
        logger -t straznik-watchdog "restart usługi $usluga"
        rm -f "$stan"
        systemctl restart "$usluga"
    fi
}

# Writer: liczy i alarmuje. Pytamy o zdrowie, bo tu chodzi o kolektory.
pilnuj straznik http://127.0.0.1:40141/api/health
# Reader: podaje gotowe bajty. Pytamy o to, co naprawdę dostaje człowiek.
# Gdy nie ma świeżego stanu od writera, oddaje 503 — restart readera tego nie
# naprawi, ale `curl -f` potraktuje to jako błąd, więc pytamy o stronę.
pilnuj straznik-reader http://127.0.0.1:40142/

# stary plik licznika z czasów jednego procesu
rm -f /run/straznik-watchdog.fails
