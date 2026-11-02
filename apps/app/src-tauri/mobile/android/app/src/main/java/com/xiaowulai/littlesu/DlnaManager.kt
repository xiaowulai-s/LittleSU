package com.xiaowulai.littlesu

import android.content.Context
import android.net.wifi.WifiManager
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * 局域网 DLNA/UPnP MediaRenderer 发现与 AVTransport 控制。
 * 只使用系统 API，不依赖 Google Cast SDK；电视需与手机处于同一局域网。
 */
class DlnaManager(private val context: Context, private val webView: WebView) {
  private data class Device(val id: String, val name: String, val controlUrl: String)

  private val executor = Executors.newSingleThreadExecutor()
  private val devices = ConcurrentHashMap<String, Device>()

  fun discover(): Boolean {
    executor.execute {
      try {
        runDiscovery()
      } catch (_: Exception) {
        emit("lsu:dlna-devices", "[]")
      }
    }
    return true
  }

  fun cast(deviceId: String, url: String, title: String): Boolean {
    val device = devices[deviceId] ?: return false
    if (!url.startsWith("http://") && !url.startsWith("https://")) return false
    executor.execute {
      val ok = try {
        setTransportUri(device, url, title) && play(device)
      } catch (_: Exception) {
        false
      }
      emit(
        "lsu:dlna-cast",
        JSONObject()
          .put("ok", ok)
          .put("deviceId", deviceId)
          .put("name", device.name)
          .put("message", if (ok) "已开始投屏" else "电视拒绝了播放请求")
          .toString(),
      )
    }
    return true
  }

  fun stop(deviceId: String): Boolean {
    val device = devices[deviceId] ?: return false
    executor.execute {
      val ok = try {
        action(device, "Stop", "<InstanceID>0</InstanceID>")
      } catch (_: Exception) {
        false
      }
      emit(
        "lsu:dlna-stop",
        JSONObject().put("ok", ok).put("deviceId", deviceId).toString(),
      )
    }
    return true
  }

  fun shutdown() {
    executor.shutdownNow()
  }

  private fun runDiscovery() {
    val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    val lock = wifi?.createMulticastLock("lsu-dlna")?.apply {
      setReferenceCounted(false)
      acquire()
    }
    val socket = DatagramSocket()
    socket.soTimeout = 1200
    val found = LinkedHashMap<String, String>()
    try {
      val request = buildString {
        append("M-SEARCH * HTTP/1.1\r\n")
        append("HOST: 239.255.255.250:1900\r\n")
        append("MAN: \"ssdp:discover\"\r\n")
        append("MX: 2\r\n")
        append("ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n")
        append("\r\n")
      }.toByteArray()
      val group = InetAddress.getByName("239.255.255.250")
      repeat(3) {
        try {
          socket.send(DatagramPacket(request, request.size, group, 1900))
        } catch (_: Exception) {
          /* 网络不可用时继续等待已有响应 */
        }
        val until = System.currentTimeMillis() + 1400
        while (System.currentTimeMillis() < until) {
          try {
            val buffer = ByteArray(4096)
            val packet = DatagramPacket(buffer, buffer.size)
            socket.receive(packet)
            val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
            locateHeader(text, "LOCATION")?.let { location ->
              if (location.startsWith("http://", true) || location.startsWith("https://", true)) {
                found[location] = location
              }
            }
          } catch (_: SocketTimeoutException) {
            break
          } catch (_: Exception) {
            break
          }
        }
      }
    } finally {
      try { socket.close() } catch (_: Exception) { }
      try { lock?.release() } catch (_: Exception) { }
    }

    devices.clear()
    for (location in found.values) {
      try {
        describe(location)?.let { devices[it.id] = it }
      } catch (_: Exception) {
        /* 单个电视描述失败不影响其它设备 */
      }
    }
    val array = JSONArray()
    devices.values.sortedBy { it.name }.forEach { device ->
      array.put(JSONObject().put("id", device.id).put("name", device.name))
    }
    emit("lsu:dlna-devices", array.toString())
  }

  private fun locateHeader(response: String, name: String): String? {
    return response.lineSequence()
      .mapNotNull { line ->
        val index = line.indexOf(':')
        if (index <= 0) null else line.substring(0, index).trim() to line.substring(index + 1).trim()
      }
      .firstOrNull { it.first.equals(name, ignoreCase = true) }
      ?.second
  }

  private fun describe(location: String): Device? {
    val connection = URL(location).openConnection() as HttpURLConnection
    connection.connectTimeout = 2500
    connection.readTimeout = 2500
    connection.requestMethod = "GET"
    val xml = try {
      BufferedInputStream(connection.inputStream).bufferedReader().use { it.readText() }
    } finally {
      connection.disconnect()
    }
    val name = Regex("<friendlyName>([\\s\\S]*?)</friendlyName>")
      .find(xml)?.groupValues?.get(1)?.let(::unescapeXml)?.trim()
      ?.takeIf { it.isNotEmpty() } ?: return null
    val udn = Regex("<UDN>([\\s\\S]*?)</UDN>").find(xml)?.groupValues?.get(1)?.trim()
    val serviceBlock = Regex("<service>([\\s\\S]*?)</service>")
      .findAll(xml)
      .map { it.groupValues[1] }
      .firstOrNull { it.contains("AVTransport:1") }
      ?: return null
    val control = Regex("<controlURL>([\\s\\S]*?)</controlURL>")
      .find(serviceBlock)?.groupValues?.get(1)?.trim()
      ?.takeIf { it.isNotEmpty() } ?: return null
    val controlUrl = try {
      URI(location).resolve(control).toString()
    } catch (_: Exception) {
      return null
    }
    if (!controlUrl.startsWith("http://", true) && !controlUrl.startsWith("https://", true)) return null
    val id = udn?.takeIf { it.isNotEmpty() } ?: controlUrl.hashCode().toString()
    return Device(id, name, controlUrl)
  }

  private fun setTransportUri(device: Device, url: String, title: String): Boolean {
    val mime = if (url.contains(".m3u8", ignoreCase = true)) {
      "application/vnd.apple.mpegurl"
    } else {
      "video/mp4"
    }
    val metadata = """<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${escapeXml(title)}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo="http-get:*:$mime:*">${escapeXml(url)}</res></item></DIDL-Lite>"""
    val inner = "<InstanceID>0</InstanceID><CurrentURI>${escapeXml(url)}</CurrentURI><CurrentURIMetaData>${escapeXml(metadata)}</CurrentURIMetaData>"
    return action(device, "SetAVTransportURI", inner)
  }

  private fun play(device: Device): Boolean =
    action(device, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>")

  private fun action(device: Device, action: String, inner: String): Boolean {
    val service = "urn:schemas-upnp-org:service:AVTransport:1"
    val body = """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:$action xmlns:u="$service">$inner</u:$action></s:Body></s:Envelope>"""
    val connection = URL(device.controlUrl).openConnection() as HttpURLConnection
    return try {
      connection.requestMethod = "POST"
      connection.connectTimeout = 3000
      connection.readTimeout = 5000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
      connection.setRequestProperty("SOAPACTION", "\"$service#$action\"")
      connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      val code = connection.responseCode
      val response = try {
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      } catch (_: Exception) {
        ""
      }
      code in 200..299 && !response.contains("<errorCode>", ignoreCase = true)
    } finally {
      connection.disconnect()
    }
  }

  private fun emit(event: String, json: String) {
    webView.post {
      try {
        webView.evaluateJavascript(
          "window.dispatchEvent(new CustomEvent('${event}',{detail:${json}}))",
          null,
        )
      } catch (_: Exception) {
        /* WebView 已销毁 */
      }
    }
  }

  private fun escapeXml(value: String): String = value
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace("\"", "&quot;")
    .replace("'", "&apos;")

  private fun unescapeXml(value: String): String = value
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&apos;", "'")
    .replace("&amp;", "&")
}
