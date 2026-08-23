package com.yasir.maktabati

import android.content.Context

/**
 * حالة العدّاد وإعدادات التنبيه — مخزَّنة أصليًا لا في WebView.
 * السبب: المنبّه يوقظ التطبيق **بلا** WebView، فلا سبيل لقراءة IndexedDB حينها.
 * فما يحتاجه الإشعار (اسم اللعبة ووقت البدء) يُنسَخ هنا عند كل تغيير للعدّاد.
 */
object Prefs {
  private fun p(ctx: Context) = ctx.getSharedPreferences("maktabati", Context.MODE_PRIVATE)

  fun saveTimer(ctx: Context, name: String, startedAt: Long, every: Long) =
    p(ctx).edit().putString("t_name", name).putLong("t_started", startedAt)
      .putLong("t_every", every).putBoolean("t_on", true).apply()

  fun clearTimer(ctx: Context) = p(ctx).edit().putBoolean("t_on", false).apply()

  fun timerOn(ctx: Context) = p(ctx).getBoolean("t_on", false)
  fun timerName(ctx: Context) = p(ctx).getString("t_name", "اللعبة") ?: "اللعبة"
  fun timerStarted(ctx: Context) = p(ctx).getLong("t_started", 0L)
  fun timerEvery(ctx: Context) = p(ctx).getLong("t_every", 5 * 60_000L)

  // ── إعدادات التنبيه التي يضبطها المستخدم من داخل التطبيق ──
  fun setInt(ctx: Context, k: String, v: Int) = p(ctx).edit().putInt(k, v).apply()
  fun getInt(ctx: Context, k: String, d: Int) = p(ctx).getInt(k, d)
  fun setBool(ctx: Context, k: String, v: Boolean) = p(ctx).edit().putBoolean(k, v).apply()
  fun getBool(ctx: Context, k: String, d: Boolean) = p(ctx).getBoolean(k, d)
}
