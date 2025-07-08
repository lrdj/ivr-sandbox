# ivr-sandbox
Repo to test IVR scripts for user experience.

## Desired interaction flow

1. Select IVR menu file (yml or json)
2. Use contents of menu file to query eleven labs api and collect audio assets
3. Once audio assets are ready, display IRV UI (a 3 x 4 grid of buttons emulating a phone keypad)
4. User clicks "Dail 097086003 now"
5. Welcome audio plays
6. User clicks on a number and menu plays
7. User continues to navigate IVR menu until...
8. User click "end call now" and goto 4 above
9. User clicks "New IVR menu" and goto 1 above

