package com.yasir.maktabati

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface

/**
 * الجسر الوحيد بين تطبيق الويب وأندرويد. **سطحٌ صغير عمدًا**: كل ما يُضاف هنا
 * يصير فرقًا بين نسخة الويب ونسخة أندرويد، ونحن نريدهما متطابقتين.
 *
 * ولذلك لا يمرّ من هنا شيء عن مكتبتك: لا ألعاب ولا ساعات ولا إنجازات. فقط
 * «شغّل تذكيرًا لهذه اللعبة» و«أوقفه» وإعدادات التنبيه.
 *
 * ⚠️ @JavascriptInterface يُعرّض الدالة لأي صفحة داخل WebView. آمنٌ هنا لأن
 * WebView لا يحمّل إلا أصولًا محلية (روابط خارجية تُفتح في المتصفح).
 */
class WebBridge(private val act: Activity) {

  @JavascriptInterface
  fun available(): Boolean = true          // يكشف للويب أنه يعمل داخل الغلاف

  /** يبدأ تذكير العدّاد. [everyMin] فاصل التكرار بالدقائق. */
  @JavascriptInterface
  fun startTimerReminder(name: String, startedAt: String, everyMin: Int) {
    if (!Prefs.getBool(act, "n_timer", true)) return       // عطّله المستخدم
    val started = startedAt.toLongOrNull() ?: System.currentTimeMillis()
    val every = (everyMin.coerceIn(1, 120)) * 60_000L
    val elapsed = System.currentTimeMillis() - started
    /* أول تذكير عند إتمام الفترة لا بعد فترة كاملة من الآن: من شغّل العدّاد
       قبل أربع دقائق يُذكَّر بعد دقيقة، لا بعد خمس. */
    val first = every - (elapsed % every)
    Reminders.schedule(act, name, started, first, every)
  }

  @JavascriptInterface
  fun stopTimerReminder() = Reminders.cancel(act)

  // ── إعدادات التنبيه ──
  @JavascriptInterface
  fun getSetting(key: String, def: Int): Int = Prefs.getInt(act, key, def)

  /* ⚠️ تغيير الفاصل أثناء عمل العدّاد يجب أن يعيد الجدولة. بلا ذلك يبقى
     المنبّه القديم معلّقًا بالقيمة القديمة، فيبدو الإعداد وكأنه لم يُطبَّق —
     وهو ما وقع فعلًا حين غُيّر من خمس دقائق إلى ثلاث. */
  @JavascriptInterface
  fun setSetting(key: String, value: Int) {
    Prefs.setInt(act, key, value)
    if (key == "n_every" && Prefs.timerOn(act)) {
      val every = value.coerceIn(1, 120) * 60_000L
      val started = Prefs.timerStarted(act)
      val elapsed = System.currentTimeMillis() - started
      Reminders.schedule(act, Prefs.timerName(act), started, every - (elapsed % every), every)
    }
  }

  /* حالة إذن الإشعارات: بدونه لا يظهر شيء ولا يُبلَّغ المستخدم بسبب.
     عرضُها في الواجهة يوفّر جولة تخمين كاملة. */
  @JavascriptInterface
  fun notifAllowed(): Boolean =
    androidx.core.app.NotificationManagerCompat.from(act).areNotificationsEnabled()

  /* تنبيه تجريبي بعد عشر ثوانٍ — يختبر السلسلة كاملة (منبّه ← مستقبِل ←
     إشعار) بلا انتظار دورة كاملة، ويكشف أي حلقة مكسورة فورًا. */
  @JavascriptInterface
  fun testReminder() {
    Prefs.saveTimer(act, "اختبار التنبيه", System.currentTimeMillis() - 61_000L, 5 * 60_000L)
    Reminders.schedule(act, "اختبار التنبيه", System.currentTimeMillis() - 61_000L, 10_000L, 5 * 60_000L)
  }

  @JavascriptInterface
  fun getFlag(key: String, def: Boolean): Boolean = Prefs.getBool(act, key, def)

  @JavascriptInterface
  fun setFlag(key: String, value: Boolean) = Prefs.setBool(act, key, value)

  /** يفتح إعدادات قنوات الإشعارات في النظام — الصوت والأهمية والإظهار على القفل */
  @JavascriptInterface
  fun openNotificationSettings() {
    val i = if (Build.VERSION.SDK_INT >= 26)
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, act.packageName)
    else
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:" + act.packageName))
    act.startActivity(i)
  }

  /** أندرويد 12+ يشترط إذنًا صريحًا للمنبّه الدقيق — بدونه يتأخّر التذكير */
  @JavascriptInterface
  fun canScheduleExact(): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    return act.getSystemService(android.app.AlarmManager::class.java).canScheduleExactAlarms()
  }

  @JavascriptInterface
  fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT < 31) return
    act.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
      .setData(Uri.parse("package:" + act.packageName)))
  }

  /** اهتزاز تجريبي ليسمع المستخدم النمط قبل أن يعتمده */
  @JavascriptInterface
  fun testVibrate(pattern: Int) {
    val v = act.getSystemService(android.os.Vibrator::class.java) ?: return
    val p = when (pattern) {
      0 -> longArrayOf(0, 120)
      2 -> longArrayOf(0, 500, 200, 500, 200, 500)
      else -> longArrayOf(0, 250, 120, 250, 120, 250)
    }
    if (Build.VERSION.SDK_INT >= 26)
      v.vibrate(android.os.VibrationEffect.createWaveform(p, -1))
    else @Suppress("DEPRECATION") v.vibrate(p, -1)
  }
}
