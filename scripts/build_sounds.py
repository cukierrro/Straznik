"""Generuje dźwięki alarmów dla natywnej warstwy Androida.

Aplikacja w otwartym stanie syntetyzuje dźwięki w Web Audio (frontend/app.js).
Usługa w tle nie ma WebView, więc te same sygnały muszą istnieć jako pliki:
kanały powiadomień i pełnoekranowy alarm (AlarmActivity) odtwarzają je z res/raw.

Kształt fali, częstotliwości i czasy są przepisane z app.js — jeśli zmienisz
brzmienie tam, uruchom ten skrypt ponownie:

    py scripts/build_sounds.py

POZIOMY są celowo INNE niż w app.js i to nie jest rozjazd do naprawienia
(pomiary 24.09.2026, scripts/test_glosnosc_alarmow.cjs pilnuje obu światów):

* W otwartej aplikacji żółty i czerwony grają obok siebie na strumieniu
  MULTIMEDIÓW, więc liczy się ich wzajemna proporcja — sygnał uwagi musi być
  słyszalnie cichszy od syreny. Dlatego app.js ma własne wzmocnienia.
* W tle nikt ich nie porównuje: żółty gra na strumieniu POWIADOMIEŃ, a czerwony
  na strumieniu ALARMÓW, podbitym do co najmniej połowy. Każdy jest oceniany
  względem innych dźwięków swojego strumienia, więc oba pliki są wyrównane
  (ok. −9 dBFS) i tak zostaje.

Wynik: android-app/android/app/src/main/res/raw/
       {alert_uwaga, alert_uwaga_cicho, alarm_syrena}.wav
"""
from __future__ import annotations

import io
import math
import struct
import sys
import wave
from pathlib import Path

SR = 22050          # Nyquist 11 kHz — z zapasem dla najwyższej składowej (1976 Hz + harmoniczne)
RAW = Path(__file__).resolve().parent.parent / "android-app/android/app/src/main/res/raw"

# ── żółty poziom: attentionChime() w app.js ──────────────────────────────────
CHIME_SEQ = [740, 988, 740, 988, 740, 988]   # fis2 ↔ h2
CHIME_DUR, CHIME_GAP = 0.34, 0.06
CHIME_PEAK, CHIME_OCTAVE_MIX = 0.55, 0.35
# Wariant „ciszej" dla osobnego kanału powiadomień: ten sam sygnał, o ~10 dB niżej.
# Dla kogoś, kogo żółty budzi w nocy, a kto nie chce wyciszać go zupełnie.
CHIME_QUIET_FACTOR = 0.32

# ── czerwony poziom: airRaidSiren() w app.js ─────────────────────────────────
SIREN_LO, SIREN_HI = 380.0, 860.0
SIREN_UP = SIREN_DOWN = 2.0
SIREN_PEAK = 0.4
SIREN_CYCLES = 2            # 8 s; AlarmActivity zapętla plik bez końca
SIREN_LOWPASS_HZ = 2200.0

FADE_S = 0.002              # znosi trzask na styku pętli


def envelope(i: int, n: int, sr: int = SR) -> float:
    """Krótkie zbocza na początku i końcu — bez nich zapętlenie klika."""
    f = int(FADE_S * sr)
    if f <= 0:
        return 1.0
    if i < f:
        return i / f
    if i >= n - f:
        return max(0.0, (n - i) / f)
    return 1.0


def chime() -> list[float]:
    step = CHIME_DUR + CHIME_GAP
    total = int((len(CHIME_SEQ) * step) * SR)
    out = [0.0] * total
    for idx, freq in enumerate(CHIME_SEQ):
        start = int(idx * step * SR)
        dur_n = int(CHIME_DUR * SR)
        for i in range(dur_n):
            t = i / SR
            # obwiednia z app.js: atak 15 ms, trzymanie, wybrzmienie ostatnie 80 ms
            if t < 0.015:
                g = CHIME_PEAK * (t / 0.015)
            elif t < CHIME_DUR - 0.08:
                g = CHIME_PEAK
            else:
                left = (CHIME_DUR - t) / 0.08
                g = CHIME_PEAK * max(0.0, left)
            phase = 2 * math.pi * freq * t
            square = 1.0 if math.sin(phase) >= 0 else -1.0
            octave = math.sin(2 * phase) * CHIME_OCTAVE_MIX
            pos = start + i
            if pos < total:
                out[pos] += g * (square + octave) / (1 + CHIME_OCTAVE_MIX)
    return out


def siren() -> list[float]:
    cycle = SIREN_UP + SIREN_DOWN
    n = int(SIREN_CYCLES * cycle * SR)
    out = [0.0] * n
    phase = 0.0
    # jednobiegunowy filtr dolnoprzepustowy — odpowiednik BiquadFilter 2200 Hz w app.js
    rc = 1.0 / (2 * math.pi * SIREN_LOWPASS_HZ)
    alpha = (1.0 / SR) / (rc + 1.0 / SR)
    lp = 0.0
    for i in range(n):
        t_in_cycle = (i / SR) % cycle
        # wykładnicze przejścia 380→860 i 860→380, jak exponentialRampToValueAtTime
        if t_in_cycle < SIREN_UP:
            k = t_in_cycle / SIREN_UP
            freq = SIREN_LO * (SIREN_HI / SIREN_LO) ** k
        else:
            k = (t_in_cycle - SIREN_UP) / SIREN_DOWN
            freq = SIREN_HI * (SIREN_LO / SIREN_HI) ** k
        phase = (phase + freq / SR) % 1.0
        saw = 2.0 * phase - 1.0
        lp += alpha * (saw - lp)
        out[i] = lp * SIREN_PEAK * envelope(i, n)
    return out


def write_wav(path: Path, samples: list[float], nadpisz: bool = False) -> bool:
    """Zapisuje plik. Gdy istniejący RÓŻNI SIĘ od wyliczonego, domyślnie go NIE rusza.

    Powód (24.09.2026): wydany `alarm_syrena.wav` ma szczyt 0,679, a z obecnych
    stałych wychodzi 0,59 — plik i generator rozjechały się kiedyś i nikt tego nie
    zauważył. Ciche nadpisanie zmieniłoby brzmienie CZERWONEGO alarmu przy okazji
    zupełnie innej poprawki. Podmiana sygnału to osobna, świadoma decyzja:
    `py scripts/build_sounds.py --nadpisz`.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s)) * 32767)
        frames += struct.pack("<h", v)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames))
    nowy = buf.getvalue()
    if path.exists() and path.read_bytes() != nowy and not nadpisz:
        print(f"{path.name}: POMINIĘTY — wydany plik różni się od wyliczonego. "
              f"Podmień świadomie: --nadpisz")
        return False
    path.write_bytes(nowy)
    print(f"{path.name}: {len(samples)/SR:.2f} s, {path.stat().st_size/1024:.0f} KB")
    return True


if __name__ == "__main__":
    nadpisz = "--nadpisz" in sys.argv
    dzwonek = chime()
    write_wav(RAW / "alert_uwaga.wav", dzwonek, nadpisz)
    write_wav(RAW / "alert_uwaga_cicho.wav",
              [s * CHIME_QUIET_FACTOR for s in dzwonek], nadpisz)
    write_wav(RAW / "alarm_syrena.wav", siren(), nadpisz)
