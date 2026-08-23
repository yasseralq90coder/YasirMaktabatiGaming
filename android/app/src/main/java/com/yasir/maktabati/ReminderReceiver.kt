package com.yasir.maktabati

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * يستقبل المنبّه فيُظهر التذكير **ثم يعيد جدولة التالي** — فيتكرّر كل خمس دقائق
 * ما دام العدّاد شغّالًا. سلسلة متتابعة لا جدولة مسبقة طويلة: الأخيرة تفشل مع
 * أي إعادة تشغيل أو تنظيف للنظام.
 *
 * ⚠️ لا يُظهر شيئًا إن كان العدّاد متوقّفًا. المنبّه قد يصل بعد أن يوقفه
 * المستخدم، فتذكّره بشيء انتهى — والحالة المخزَّنة هي الحكم لا وصول المنبّه.
 */
class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (!Prefs.timerOn(ctx)) return

    val name = Prefs.timerName(ctx)
    val started = Prefs.timerStarted(ctx)
    val every = Prefs.timerEvery(ctx)
    val elapsed = System.currentTimeMillis() - started
    if (elapsed < 60_000L) return

    val h = elapsed / 3_600_000L
    val m = (elapsed % 3_600_000L) / 60_000L
    val dur = (if (h > 0) "${h}س " else "") + "${m}د"

    val open = PendingIntent.getActivity(
      ctx, 0, Intent(ctx, MainActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val vibrate = Prefs.getBool(ctx, "n_vibrate", true)
    val pattern = when (Prefs.getInt(ctx, "n_pattern", 1)) {
      0 -> longArrayOf(0, 120)                                  // خفيف
      2 -> longArrayOf(0, 500, 200, 500, 200, 500)              // قوي
      else -> longArrayOf(0, 250, 120, 250, 120, 250)           // متوسط
    }

    val n = NotificationCompat.Builder(ctx, Reminders.CH_TIMER)
      .setSmallIcon(android.R.drawable.ic_menu_recent_history)
      .setContentTitle("⏱️ عدّاد اللعب لا يزال شغالًا")
      .setContentText("$name — $dur حتى الآن. لا تنسَ إيقافه إذا خلصت!")
      .setStyle(NotificationCompat.BigTextStyle().bigText("$name — $dur حتى الآن.\nلا تنسَ إيقافه إذا خلصت، وإلا سُجّلت ساعات لم تلعبها."))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setOngoing(Prefs.getBool(ctx, "n_sticky", false))
      .setAutoCancel(true)
      .setContentIntent(open)
      .apply { if (vibrate) setVibrate(pattern) else setVibrate(longArrayOf(0)) }
      .build()

    ctx.getSystemService(NotificationManager::class.java).notify(4201, n)

    // السلسلة تُعيد تسليح نفسها
    Reminders.schedule(ctx, name, started, every, every)
  }
}
