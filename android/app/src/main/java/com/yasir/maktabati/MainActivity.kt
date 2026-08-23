package com.yasir.maktabati

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * غلاف أصلي لتطبيق الويب. **نفس `index.html` بالضبط** يُحمَّل من أصول التطبيق —
 * لا نسخة ثانية تتباعد عن الأولى، ولا شبكة، ففتحُه فوري.
 *
 * ما يضيفه الغلاف قدرةٌ واحدة لا يملكها الويب: **إشعار مجدول يصل والتطبيق مغلق**.
 * الويب لا يستطيعها بلا خادم (واجهة showTrigger لم تُشحن في أي متصفح، وسلسلة
 * setTimeout داخل Service Worker تموت مع العامل الخامل). أندرويد يفعلها بـ
 * AlarmManager بلا خادم إطلاقًا.
 */
class MainActivity : AppCompatActivity() {

  private lateinit var web: WebView

  private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    Reminders.ensureChannels(this)

    web = WebView(this)
    setContentView(web)

    web.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true          // IndexedDB وlocalStorage — كل بيانات المكتبة
      databaseEnabled = true
      mediaPlaybackRequiresUserGesture = false
      // الأصول محلية، فلا حاجة لأي وصول لملفات النظام
      allowFileAccess = false
      allowContentAccess = false
      textZoom = 100                    // لا يتبع تكبير خط النظام: التصميم محسوب بدقّة
    }
    /* مفعَّل دائمًا لا في التصحيح وحده: نسخة الإصدار هي التي تُثبَّت على الجهاز،
       وبلا chrome://inspect لا سبيل لمعرفة سبب شاشة سوداء. لا يكشف بيانات —
       يفتح فقط لمن وصل الجهاز بحاسب ومعه أمر التصحيح. */
    WebView.setWebContentsDebuggingEnabled(true)

    web.addJavascriptInterface(WebBridge(this), "Android")

    /* أصول محلية عبر مضيف افتراضي لا file:// — الأخير يجعل الأصل "null" فتُعطَّل
       IndexedDB وService Worker وتنكسر سياسة المصدر الواحد. */
    val assets = androidx.webkit.WebViewAssetLoader.Builder()
      .addPathHandler("/", androidx.webkit.WebViewAssetLoader.AssetsPathHandler(this))
      .build()
    web.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(v: WebView, req: android.webkit.WebResourceRequest) =
        assets.shouldInterceptRequest(req.url)
      override fun shouldOverrideUrlLoading(v: WebView, req: android.webkit.WebResourceRequest): Boolean {
        val u = req.url.toString()
        if (u.startsWith("https://appassets.androidplatform.net")) return false
        return try {
          startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, req.url)); true
        } catch (e: Exception) { true }
      }
    }
    web.loadUrl("https://appassets.androidplatform.net/index.html")

    if (Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
          != PackageManager.PERMISSION_GRANTED) {
      askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }

  /** زر الرجوع يتنقّل داخل التطبيق قبل أن يخرج منه */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (web.canGoBack()) web.goBack() else super.onBackPressed()
  }
}
