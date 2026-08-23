package com.yasir.maktabati

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * محرّك التذكير. **هذا هو سبب وجود تطبيق أندرويد أصلًا.**
 *
 * المشكلة: تنسى عدّاد اللعب شغّالًا فتُسجَّل ساعات لم تلعبها. والويب عاجز عنها:
 * سلسلة setTimeout داخل Service Worker تموت حين يُنهي النظام العامل الخامل،
 * وواجهة جدولة الإشعارات المحلية لم تُشحن في أي متصفح، فلم يبقَ إلا خادم Push.
 *
 * أندرويد يحلّها بلا خادم: AlarmManager ينبّه في وقته والتطبيق مغلق تمامًا.
 *
 * ⚠️ setExactAndAllowWhileIdle لا setExact: وضع Doze يؤجّل المنبّهات العادية
 * إلى نافذة الصيانة التالية — وقد تكون بعد ساعة. والتذكير المتأخّر ساعةً عن
 * موعده لا قيمة له هنا.
 */
object Reminders {

  const val CH_TIMER = "timer"          // تذكير العدّاد
  const val CH_GENERAL = "general"      // إنجازات وتنبيهات عامّة
  private const val REQ = 4201

  fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    /* قناتان لا واحدة: يستطيع المستخدم إسكات الإنجازات وإبقاء تذكير العدّاد —
       وهو التنبيه الوحيد الذي يمنع ضياع بيانات حقيقية. */
    NotificationChannel(CH_TIMER, "تذكير عدّاد اللعب", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "ينبّهك إذا بقي العدّاد شغّالًا بعد أن تخلّص اللعب"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250, 120, 250, 120, 250)
      setShowBadge(true)
    }.also { nm.createNotificationChannel(it) }

    NotificationChannel(CH_GENERAL, "الإنجازات والرتب", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "فتح وسام أو بلوغ رتبة جديدة"
      enableVibration(true)
      setShowBadge(true)
    }.also { nm.createNotificationChannel(it) }
  }

  private fun intentFor(ctx: Context, name: String, startedAt: Long, every: Long) =
    Intent(ctx, ReminderReceiver::class.java).apply {
      putExtra("name", name); putExtra("startedAt", startedAt); putExtra("every", every)
    }

  private fun pending(ctx: Context, i: Intent) = PendingIntent.getBroadcast(
    ctx, REQ, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  /** يجدول تذكيرًا بعد [delayMs]. يستبدل أي تذكير سابق (طلب واحد بمعرّف ثابت). */
  fun schedule(ctx: Context, name: String, startedAt: Long, delayMs: Long, every: Long) {
    val am = ctx.getSystemService(AlarmManager::class.java)
    val at = System.currentTimeMillis() + delayMs.coerceAtLeast(1000L)
    val pi = pending(ctx, intentFor(ctx, name, startedAt, every))
    try {
      if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)   // تراجعٌ مهذّب بلا انهيار
      } else {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      }
    } catch (e: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
    Prefs.saveTimer(ctx, name, startedAt, every)
  }

  fun cancel(ctx: Context) {
    ctx.getSystemService(AlarmManager::class.java)
      .cancel(pending(ctx, intentFor(ctx, "", 0L, 0L)))
    ctx.getSystemService(NotificationManager::class.java).cancel(REQ)
    Prefs.clearTimer(ctx)
  }
}
