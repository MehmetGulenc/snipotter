package com.snipotter.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import android.widget.Toast;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Quick Settings tile that captures the current OS clipboard text and hands it
 * to MainActivity via a snipotter:// deep link.
 *
 * Why a tile? Android 10 (API 29) blocks third-party apps from reading the
 * clipboard while in the background. The only escape hatch for a non-IME app
 * is a foreground gesture — and a tile tap counts as one. So the user pulls
 * down quick settings, taps "Panoyu kaydet", and we pipe the text into the
 * web bridge which then inserts it into Supabase like any other clip.
 *
 * Tile registration is in AndroidManifest.xml; the icon lives at
 * res/drawable/ic_tile_snip.xml (must be a 24x24dp solid-white VectorDrawable
 * per the Quick Settings tile guidelines).
 */
public class SnipTileService extends TileService {

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile == null) return;
        tile.setState(Tile.STATE_ACTIVE);
        tile.setLabel(getString(R.string.tile_label));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.setSubtitle(getString(R.string.tile_subtitle_idle));
        }
        tile.updateTile();
    }

    @Override
    public void onClick() {
        super.onClick();
        String text = readClipboardText();
        if (text == null || text.trim().isEmpty()) {
            showToast(R.string.tile_toast_empty);
            return;
        }

        // Hand off to MainActivity via a deep link so the JS bridge
        // (lib/mobile.ts) can dedupe + insert into Supabase the same way
        // a Share Target capture would. URI-encoding keeps newlines and
        // emoji intact.
        String encoded;
        try {
            encoded = URLEncoder.encode(text, StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            encoded = Uri.encode(text);
        }
        Uri uri = Uri.parse("snipotter://clip?text=" + encoded);
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage(getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // startActivityAndCollapse takes the user out of the QS panel back
        // to the home screen / our app. On Android 14 (UPSIDE_DOWN_CAKE +)
        // the int-Intent overload was deprecated in favour of PendingIntent.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(
                    this,
                    0,
                    intent,
                    android.app.PendingIntent.FLAG_IMMUTABLE
                            | android.app.PendingIntent.FLAG_UPDATE_CURRENT);
            startActivityAndCollapse(pi);
        } else {
            startActivityAndCollapse(intent);
        }
        showToast(R.string.tile_toast_saved);
    }

    private String readClipboardText() {
        ClipboardManager cm =
                (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null || !cm.hasPrimaryClip()) return null;
        ClipData clip = cm.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence cs = clip.getItemAt(0).coerceToText(this);
        return cs == null ? null : cs.toString();
    }

    private void showToast(int resId) {
        Toast.makeText(getApplicationContext(), resId, Toast.LENGTH_SHORT).show();
    }
}
