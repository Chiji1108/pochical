# When the stores' screenshots cannot be made (android.sh, ios.sh): before
# 9:00 on a month's 1st. いまのシフト's ring is drawn while a shift is on,
# and the shift on then is the day before's 夜勤, a day the month's page
# does not show for the capture to enter it on.
if [ "$(date +%d)" = 01 ] && [ "$(date +%H)" -lt 9 ]; then
  echo "before 9:00 on a month's 1st no shift of the month's page is on for いまのシフト's ring: run from 9:00" >&2
  exit 1
fi
