# Strażnik 1.7.34 — weto nie kasuje już prawdziwego meldunku

- Weto „dni po” trafiało w środek słowa „wschodni powiat” i kasowało prawdziwy meldunek o poderwaniu lotnictwa. Hasła muszą się teraz zaczynać na granicy słowa.
- Weta podzielone na twarde i miękkie: „ćwiczenia” czy „rocznica” kasują wszystko, ale „potrwają” czy „co wiemy” tylko obniżają relację operacyjną z 1,5 do 1,0 pkt zamiast ją blokować.
- Progi i limity bez zmian; same media nadal nigdy nie alarmują.

## Skąd to się wzięło

Ustalenie A8 z audytu 1.7.21 mówiło o dwóch rzeczach naraz: weta z granicami słów
oraz weto, które **obniża** frazę krytyczną zamiast ją blokować. Przy dzisiejszej
przebudowie przypisywania artykułów do województw założyłem granicę słowa tylko
dopasowaniu nazw miejscowości — lista wet jej nie dostała. Zmierzone na kodzie
przed poprawką:

```
"Poderwano myśliwce. Wschodni powiat w gotowości"        → WETO ['dni po']
"Zamknięto przestrzeń powietrzną. Utrudnienia potrwają"  → WETO ['potrwa']
```

Pierwsze to prawdziwy meldunek wycięty przez podciąg w środku „wscho-DNI PO-wiat”.
Drugie to fraza **krytyczna** skasowana przez weto, które mówi tylko tyle, że
artykuł opisuje skutki, a nie samo zdarzenie.

## Twarde i miękkie

Podział jest tu istotny i nie da się go zastąpić jedną regułą. Weto „ćwiczenia”
albo „rocznica” musi kasować także frazę krytyczną — przy teście syren one
naprawdę zawyły, a mimo to nic się nie dzieje. Weto „co wiemy” albo „potrwają”
znaczy co innego: zdarzenie jest prawdziwe, tylko artykuł jest jego omówieniem.

Szesnaście fraz zostało miękkich: poradniki („co zrobić w razie”, „poznaj sygnały
alarmowe”), omówienia („co wiemy”, „jak doszło”, „kulisy”, „czy na pewno”) oraz
relacje o skutkach („potrwa”, „przypominamy”). Reszta — retrospektywy, rocznice,
ćwiczenia, testy syren, fikcja, kosmos, sport i alarmy bombowe — pozostaje twarda.

Miękkie weto działa tylko wtedy, gdy w tekście jest fraza krytyczna. Sam poradnik
bez takiej frazy jest odrzucany dokładnie jak dotąd.

Efekt na przykładach:

| nagłówek | przed | po |
| --- | --- | --- |
| Poderwano myśliwce. Wschodni powiat w gotowości | 0 | **1,5** |
| Zamknięto przestrzeń powietrzną. Utrudnienia potrwają | 0 | **1,0** |
| Zawyły syreny w Lublinie. Przypominamy, co oznacza sygnał alarmowy | 0 | **1,0** |
| Syreny zawyły — to ogólnopolskie ćwiczenia | 0 | 0 |
| Poznaj sygnały alarmowe — poradnik | 0 | 0 |

Na żywych kanałach w chwili wydania żaden z 250 sprawdzonych artykułów nie zmienił
wyniku — poprawka celuje w konkretną klasę przypadków, nie rozluźnia filtra.

## Testy

`scripts/test_textmatch.py` urósł z 44 do 52 przypadków; osiem nowych to wprost
przykłady z audytu, po obu stronach: te, które mają teraz przechodzić, i te, które
nadal muszą być kasowane. Doszły dwie asercje na sam mechanizm obniżania.
`scripts/test_slownik_regionow.py` pilnuje, żeby lista miękkich wet była
identyczna w backendzie i w silniku wbudowanym.
