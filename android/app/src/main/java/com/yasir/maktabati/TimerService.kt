package com.yasir.maktabati

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * خدمة أمامية تعيش ما دام العدّاد شغّالًا.
 *
 * ⚠️ **لماذا خدمة بدل AlarmManager وحده**: `setExactAndAllowWhileIdle` يُقيَّد
 * بمرّة كل تسع دقائق تقريبًا في وضع Doze، فتذكيرٌ كل ثلاث أو خمس دقائق يُؤجَّل
 * ويبدو وكأنه «توقّف بعد أول تنبيه» — وهو ما وقع فعلًا. الخدمة الأمامية لا
 * يقتلها النظام ولا يؤجّل مؤقّتها، فالسلسلة تعمل بالدقّة المطلوبة.
 *
 * وفائدة ثانية أهمّ: إشعار **دائم** يعرض الوقت المنقضي. المشكلة الأصلية أنك
 * تنسى العدّاد؛ إشعارٌ ثابت أمام عينك خيرٌ من تنبيه كل بضع دقائق.
 */
class TimerService : Service() {

  companion object {
    const val ONGOING_ID = 4200
    const val ALERT_ID = 4201
    fun start(ctx: Context) {
      val i = Intent(ctx, TimerService::class.java)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
    }
    fun stop(ctx: Context) = ctx.stopService(Intent(ctx, TimerService::class.java))
  }

  private val handler = Handler(Looper.getMainLooper())
  private var lastAlertBucket = -1L

  private val tick = object : Runnable {
    override fun run() {
      if (!Prefs.timerOn(this@TimerService)) { stopSelf(); return }
      val started = Prefs.timerStarted(this@TimerService)
      val elapsed = System.currentTimeMillis() - started
      val every = Prefs.timerEvery(this@TimerService)

      // حدّث الإشعار الدائم
      nm().notify(ONGOING_ID, ongoing(elapsed))

      /* التنبيه على حدود الفترة لا كل تكّة: القسمة على الفترة تعطي رقم الشريحة،
         وتغيّره يعني أن فترة جديدة اكتملت. يعمل بعد تغيير الفاصل أيضًا. */
      val bucket = elapsed / every
      if (bucket > 0 && bucket != lastAlertBucket) {
        lastAlertBucket = bucket
        if (Prefs.getBool(this@TimerService, "n_timer", true)) alert(elapsed)
      }
      handler.postDelayed(this, 20_000L)
    }
  }

  private fun nm() = getSystemService(NotificationManager::class.java)

  private fun openIntent() = PendingIntent.getActivity(
    this, 0, Intent(this, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun fmt(ms: Long): String {
    val h = ms / 3_600_000L; val m = (ms % 3_600_000L) / 60_000L
    return (if (h > 0) "${h}س " else "") + "${m}د"
  }

  private fun ongoing(elapsed: Long): Notification =
    NotificationCompat.Builder(this, Reminders.CH_ONGOING)
      .setSmallIcon(android.R.drawable.ic_menu_recent_history)
      .setContentTitle("⏱️ " + Prefs.timerName(this))
      .setContentText("العدّاد شغّال — " + fmt(elapsed))
      .setOngoing(true)            // لا يُمسح بالسحب: هذا هو المقصود
      .setSilent(true)             // الدائم صامت؛ الصوت للتنبيه الدوري وحده
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(openIntent())
      .build()

  private fun alert(elapsed: Long) {
    val vibrate = Prefs.getBool(this, "n_vibrate", true)
    val sound = Prefs.getBool(this, "n_sound", true)
    val pattern = when (Prefs.getInt(this, "n_pattern", 1)) {
      0 -> longArrayOf(0, 120)
      2 -> longArrayOf(0, 500, 200, 500, 200, 500)
      else -> longArrayOf(0, 250, 120, 250, 120, 250)
    }
    val b = NotificationCompat.Builder(this, Reminders.CH_TIMER)
      .setSmallIcon(android.R.drawable.ic_menu_recent_history)
      .setContentTitle("⏱️ عدّاد اللعب لا يزال شغالًا")
      .setContentText(Prefs.timerName(this) + " — " + fmt(elapsed) + " حتى الآن.")
      .setStyle(NotificationCompat.BigTextStyle().bigText(
        Prefs.timerName(this) + " — " + fmt(elapsed) + " حتى الآن.\nلا تنسَ إيقافه إذا خلصت، وإلا سُجّلت ساعات لم تلعبها."))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setContentIntent(openIntent())
    if (vibrate) b.setVibrate(pattern) else b.setVibrate(longArrayOf(0))
    if (sound) b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
    nm().notify(ALERT_ID, b.build())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Reminders.ensureChannels(this)
    val started = Prefs.timerStarted(this)
    startForeground(ONGOING_ID, ongoing(System.currentTimeMillis() - started))
    lastAlertBucket = (System.currentTimeMillis() - started) / Prefs.timerEvery(this)
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY          // النظام يعيد تشغيلها إن قتلها لضيق الذاكرة
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    nm().cancel(ONGOING_ID)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
