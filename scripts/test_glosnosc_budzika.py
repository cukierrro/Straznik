# -*- coding: utf-8 -*-
"""Głośność „Alarmy” po czerwonym alarmie nie może wyciszyć budzika (opinia w Play, 20.11.2026).

Motorola edge 70, 1.8.09: „po wyłączeniu alertu w aplikacji zostaje wyciszony systemowy budzik”.
Do 1.8.13 zapisana głośność „sprzed alarmu” zostawała w pamięci, gdy przywrócenie nie doszło do
skutku, a następny alarm jej nie nadpisywał — po nim aplikacja ustawiała głośność sprzed wielu
godzin, choćby 0. Od 1.8.14 decyzje podejmuje GlosnoscAlarmu (bez Androida), a Alarms.java
zapisuje też głośność ustawioną przez aplikację i przywraca tylko, gdy nikt jej nie zmienił.

Test kompiluje GlosnoscAlarmu.java (javac z JAVA_HOME, PATH albo JBR Android Studio) i sprawdza
scenariusze, a w Alarms.java — że podnoszenie i przywracanie naprawdę z niej korzystają.

Uruchomienie:  py scripts/test_glosnosc_budzika.py
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
KORZEN = Path(__file__).resolve().parent.parent
JAVA = KORZEN / "android-app/android/app/src/main/java/pl/straznik/app"
bledy = []


def ok(warunek, opis):
    print(("OK   " if warunek else "BLAD ") + opis)
    if not warunek:
        bledy.append(opis)


def znajdz(nazwa):
    kandydaci = []
    if os.environ.get("JAVA_HOME"):
        kandydaci.append(Path(os.environ["JAVA_HOME"]) / "bin")
    kandydaci += [Path(r"C:\Program Files\Android\Android Studio\jbr\bin"), Path("/usr/lib/jvm/default-java/bin")]
    for k in kandydaci:
        for n in (nazwa + ".exe", nazwa):
            if (k / n).exists():
                return str(k / n)
    return shutil.which(nazwa)


HARNESS = r"""
package pl.straznik.app;
public class TestGlosnosci {
    static final int B = GlosnoscAlarmu.BRAK;
    // Symulacja tego, co robi Alarms.raiseAlarmVolume / restoreAlarmVolume na SharedPreferences.
    static int zapisana = B, ustawiona = B, glosnosc;
    static void podnies(int cel) {
        if (cel <= glosnosc) return;
        int cur = glosnosc;
        glosnosc = cel;
        boolean z = GlosnoscAlarmu.zapisac(zapisana, ustawiona, cur);
        ustawiona = glosnosc;
        if (z) zapisana = cur;
    }
    static void przywroc() {
        int s = zapisana, u = ustawiona;
        zapisana = B; ustawiona = B;
        if (GlosnoscAlarmu.przywrocic(s, u, glosnosc)) glosnosc = s;
    }
    static void stan(int g, int z, int u) { glosnosc = g; zapisana = z; ustawiona = u; }
    public static void main(String[] a) {
        // 1. zwykły alarm: 3 → 8 → po wyciszeniu 3
        stan(3, B, B); podnies(8); przywroc(); System.out.println("zwykly " + glosnosc);
        // 2. błąd z opinii: w pamięci stary zapis 0 (sprzed 1.8.14, bez znanej ustawionej),
        //    użytkownik ustawił budzik na 6; alarm podnosi do 8; po wyciszeniu ma wrócić 6, nie 0
        stan(6, 0, B); podnies(8); przywroc(); System.out.println("staryZapis " + glosnosc);
        // 3. przywrócenie nie doszło do skutku, potem użytkownik zmienił głośność na 5,
        //    nowy alarm podnosi do 8 — po wyciszeniu 5, nie dawne 3
        stan(9, 3, 8); podnies(8); System.out.println("bezPodniesienia " + glosnosc + " " + zapisana);
        przywroc(); System.out.println("bezPodniesieniaPotem " + glosnosc);
        stan(5, 3, 8); podnies(10); przywroc(); System.out.println("zmianaPomiedzy " + glosnosc);
        // 4. alarm za alarmem bez przywrócenia: dalej obowiązuje głośność sprzed pierwszego
        stan(8, 3, 8); podnies(15); przywroc(); System.out.println("alarmZaAlarmem " + glosnosc);
        // 5. użytkownik w trakcie alarmu zmienił głośność na 12 — jego wybór zostaje
        stan(3, B, B); podnies(8); glosnosc = 12; przywroc(); System.out.println("zmianaWTrakcie " + glosnosc);
        // 6. nieaktualny stary zapis przy wyciszeniu (bez podniesienia) — nic nie zmienia
        stan(7, 0, B); przywroc(); System.out.println("tylkoStaryZapis " + glosnosc);
        // 7. budzik wyciszony przez użytkownika (0) przed alarmem — po alarmie znów 0, jak było
        stan(0, B, B); podnies(8); przywroc(); System.out.println("byloZero " + glosnosc);
    }
}
"""

print("1. decyzje GlosnoscAlarmu (kompilacja javac)")
javac, java = znajdz("javac"), znajdz("java")
ok(javac is not None and java is not None, f"javac i java znalezione ({javac})")
if javac and java:
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        (t / "TestGlosnosci.java").write_text(HARNESS, encoding="utf-8")
        r = subprocess.run([javac, "-encoding", "UTF-8", "-d", str(t / "out"),
                            str(JAVA / "GlosnoscAlarmu.java"), str(t / "TestGlosnosci.java")],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        ok(r.returncode == 0, "kompilacja " + r.stderr[:300])
        if r.returncode == 0:
            r = subprocess.run([java, "-cp", str(t / "out"), "pl.straznik.app.TestGlosnosci"],
                               capture_output=True, text=True, encoding="utf-8", errors="replace")
            wyn = dict(l.split(" ", 1) for l in r.stdout.strip().splitlines())
            ok(wyn.get("zwykly") == "3", "zwykły alarm: po wyciszeniu wraca 3")
            ok(wyn.get("staryZapis") == "6", "stary zapis 0 sprzed 1.8.14: po alarmie 6, nie 0 (błąd z opinii)")
            ok(wyn.get("bezPodniesienia") == "9 3", "głośność już wyższa niż cel: aplikacja nic nie rusza")
            ok(wyn.get("bezPodniesieniaPotem") == "9", "…a przy otwarciu aplikacji stary zapis nie cofa jej do 3")
            ok(wyn.get("zmianaPomiedzy") == "5", "zmiana ręczna między alarmami: wraca 5, nie dawne 3")
            ok(wyn.get("alarmZaAlarmem") == "3", "alarm za alarmem: wraca głośność sprzed pierwszego")
            ok(wyn.get("zmianaWTrakcie") == "12", "zmiana ręczna w trakcie alarmu zostaje")
            ok(wyn.get("tylkoStaryZapis") == "7", "nieaktualny zapis przy wyciszeniu nic nie zmienia")
            ok(wyn.get("byloZero") == "0", "budzik wyciszony przed alarmem — wraca 0, jak było")

print("\n2. Alarms.java korzysta z tych decyzji")
src = (JAVA / "Alarms.java").read_text(encoding="utf-8")
m_raise = re.search(r"static void raiseAlarmVolume\(Context ctx\) \{(.*?)\n    \}\n", src, re.S)
m_rest = re.search(r"static void restoreAlarmVolume\(Context ctx\) \{(.*?)\n    \}\n", src, re.S)
ok(m_raise is not None and m_rest is not None, "znalezione raiseAlarmVolume i restoreAlarmVolume")
if m_raise and m_rest:
    r_, p_ = m_raise.group(1), m_rest.group(1)
    ok("GlosnoscAlarmu.zapisac(" in r_, "podnoszenie pyta GlosnoscAlarmu.zapisac")
    ok("KEY_SET_VOLUME" in r_ and "getStreamVolume" in r_.split("setStreamVolume", 1)[-1],
       "podnoszenie zapisuje głośność odczytaną PO ustawieniu")
    ok("if (!p.contains(KEY_SAVED_VOLUME)) p.edit().putInt(KEY_SAVED_VOLUME" not in r_,
       "nie ma dawnego „zapisz tylko, gdy pusto” (źródło błędu)")
    ok("GlosnoscAlarmu.przywrocic(" in p_, "przywracanie pyta GlosnoscAlarmu.przywrocic")
    ok(re.search(r"remove\(KEY_SAVED_VOLUME\)\s*\.remove\(KEY_SET_VOLUME\)", p_) is not None,
       "przywracanie czyści oba zapisy")
    ok(p_.index("remove(KEY_SAVED_VOLUME)") < p_.index("setStreamVolume"),
       "zapisy znikają przed zmianą głośności (bez powtórnego przywracania)")

if bledy:
    print(f"\nBLEDY: {len(bledy)}")
    sys.exit(1)
print("\nOK: alarm nie zostawia budzika z głośnością sprzed wielu godzin")
