package com.yasir.maktabati

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
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

  /* WebView **يتجاهل** حقول <input type="file"> ما لم تُنفَّذ onShowFileChooser —
     الزر يُضغط ولا يحدث شيء ولا خطأ. وهذا ما كان يمنع استعادة النسخة
     الاحتياطية، وهي الطريق الوحيد لنقل المكتبة من الويب إلى التطبيق. */
  private var filePathCallback: ValueCallback<Array<Uri>>? = null
  private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
    val data = res.data
    val uris: Array<Uri>? = when {
      res.resultCode != RESULT_OK -> null
      data?.data != null -> arrayOf(data.data!!)
      data?.clipData != null -> (0 until data.clipData!!.itemCount)
        .map { data.clipData!!.getItemAt(it).uri }.toTypedArray()
      else -> null
    }
    filePathCallback?.onReceiveValue(uris)   // null يلغي الاختيار بنظافة
    filePathCallback = null
  }

  /* حفظ النسخة الاحتياطية: المستخدم يختار المكان عبر SAF فلا حاجة لأي إذن
     تخزين، ويعمل على كل الإصدارات. الملف المؤقّت كتبه الجسر على دفعات. */
  private val saveDoc = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
    val uri = res.data?.data
    if (res.resultCode == RESULT_OK && uri != null) {
      try {
        val src = java.io.File(cacheDir, "export.tmp")
        contentResolver.openOutputStream(uri)?.use { o -> src.inputStream().use { it.copyTo(o) } }
        src.delete()
        toastWeb("تم حفظ النسخة الاحتياطية ✓")
      } catch (e: Exception) { toastWeb("تعذّر الحفظ: " + (e.message ?: "")) }
    } else toastWeb("أُلغي الحفظ")
  }

  fun saveExportedFile(name: String) {
    val i = Intent(Intent.ACTION_CREATE_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("application/json")
      .putExtra(Intent.EXTRA_TITLE, name)
    try { saveDoc.launch(i) } catch (e: Exception) { toastWeb("لا يوجد تطبيق ملفات") }
  }

  /** يعرض رسالة داخل صفحة الويب — أوضح من Toast يختفي خلف الواجهة */
  private fun toastWeb(msg: String) {
    val safe = org.json.JSONObject.quote(msg)
    web.evaluateJavascript("window.__androidToast && window.__androidToast(" + safe + ")", null)
  }

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    /* ملء الشاشة: الشريط العلوي كان يغطّي أعلى المحتوى. الأشرطة تظهر بسحبة
       من الحافة ثم تختفي — سلوك immersive المعتاد. */
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

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
      // الأصول محلية ولا شبكة: خزّن ما تستطيع بلا إعادة تحقّق
      cacheMode = android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK
    }
    /* مفعَّل دائمًا لا في التصحيح وحده: نسخة الإصدار هي التي تُثبَّت على الجهاز،
       وبلا chrome://inspect لا سبيل لمعرفة سبب شاشة سوداء. لا يكشف بيانات —
       يفتح فقط لمن وصل الجهاز بحاسب ومعه أمر التصحيح. */
    WebView.setWebContentsDebuggingEnabled(true)

    web.webChromeClient = object : WebChromeClient() {
      override fun onShowFileChooser(
        v: WebView?, cb: ValueCallback<Array<Uri>>?, params: FileChooserParams?
      ): Boolean {
        filePathCallback?.onReceiveValue(null)      // اختيار سابق لم يكتمل
        filePathCallback = cb
        return try {
          pickFile.launch(params?.createIntent()); true
        } catch (e: Exception) {
          filePathCallback = null; false
        }
      }
    }

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
