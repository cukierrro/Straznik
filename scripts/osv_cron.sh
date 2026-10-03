#!/bin/sh
# Cotygodniowe sprawdzenie zależności w bazie OSV — opakowanie dla crona.
#
# Na VPS wołane z /etc/cron.d/straznik-osv w soboty 06:00 UTC.
# Ręcznie: sudo /opt/straznik/scripts/osv_cron.sh
#
# Robi trzy rzeczy, których nie da się sensownie wcisnąć w jedną linię crona:
#   1. dopisuje wynik z datą i kodem wyjścia do dziennika,
#   2. melduje się w Healthchecks, żeby CISZA też była słyszalna — sam dziennik
#      nikogo nie obudzi, a nieczytany dziennik to monitoring tylko z nazwy,
#   3. przekazuje dalej kod wyjścia skryptu.
#
# Adres pingu jest sekretem i leży POZA repozytorium, w /etc/straznik/osv-ping.url
# (root:root 600). Brak pliku = pingowanie wyłączone, a sprawdzanie i dziennik
# działają normalnie — to ma być dodatek, nie warunek.
#
# To OSOBNY czujnik niż HEALTHCHECK_PING_URL z .env. Tamten pilnuje żywej usługi
# i bije co kilka minut. Wspólny czujnik znaczyłby, że znaleziona podatność
# gasi monitoring produkcji, a awaria produkcji ukrywa podatność.
set -u

KATALOG=/opt/straznik
DZIENNIK=/var/log/straznik-osv.log
PLIK_PINGU=/etc/straznik/osv-ping.url

WYNIK=$(cd "$KATALOG" && /usr/bin/python3 scripts/osv_sprawdz.py 2>&1)
KOD=$?

{
  date -Is
  printf '%s\n' "$WYNIK"
  echo "kod wyjscia: $KOD"
} >>"$DZIENNIK" 2>&1

if [ -r "$PLIK_PINGU" ]; then
  ADRES=$(head -n 1 "$PLIK_PINGU" | tr -d ' \t\r\n')
  if [ -n "$ADRES" ]; then
    # Kod wyjścia w adresie: 0 to zaliczenie, każdy inny to awaria w Healthchecks.
    # Treść wyniku leci jako ciało, żeby powiadomienie od razu mówiło, co znaleziono.
    if ! curl -fsS -m 15 --retry 3 --data-raw "$WYNIK" "$ADRES/$KOD" >/dev/null 2>&1; then
      echo "UWAGA: nie udalo sie zameldowac w Healthchecks" >>"$DZIENNIK"
    fi
  fi
fi

exit "$KOD"
