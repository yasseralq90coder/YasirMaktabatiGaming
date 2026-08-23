package com.yasir.maktabati

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * المنبّهات تُمحى عند إعادة تشغيل الجهاز. لولا هذا لضاع التذكير بصمت لمن يعيد
 * تشغيل جواله وعدّاده شغّال — وهي الحالة التي يطول فيها النسيان أكثر.
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!Prefs.timerOn(ctx)) return
    Reminders.ensureChannels(ctx)
    Reminders.schedule(ctx, Prefs.timerName(ctx), Prefs.timerStarted(ctx),
      Prefs.timerEvery(ctx), Prefs.timerEvery(ctx))
  }
}
