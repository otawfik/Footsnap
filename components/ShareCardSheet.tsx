/**
 * Sharing a Beat the model matchday: the card (lib/share.ts) drawn as an image (lib/shareImage.ts)
 * in a sheet, with Share where the browser can share a file, and Save image and Copy text
 * everywhere. Native builds have no canvas, so they share the text (see shareMatchday).
 */
import React, { useEffect, useState } from 'react';
import { Image, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Sheet, Skeleton } from './ui';
import { shareText, type ShareCard } from '../lib/share';
import { cardHeight, cardImage } from '../lib/shareImage';
import { DEPLOYED_URL } from '../services/api';
import { radius, space, type } from '../constants/design';

const SITE = `${DEPLOYED_URL}/beat`;
const FILE = 'footsnap-beat-the-model.png';

/** Where there is no canvas (native), the card goes out as text. Returns false on the web, where the sheet takes over. */
export function shareAsText(card: ShareCard): boolean {
  if (Platform.OS === 'web') return false;
  Share.share({ message: shareText(card, SITE) }).catch(() => {});
  return true;
}

export function ShareCardSheet({ card, onClose }: { card: ShareCard | null; onClose: () => void }) {
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    setImage(null);
    setFailed(false);
    setNote('');
    if (!card) return;
    let live = true;
    let url = '';
    cardImage(card, SITE.replace(/^https?:\/\//, '')).then(
      (blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setImage({ url, file: new File([blob], FILE, { type: 'image/png' }) });
      },
      () => live && setFailed(true)
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [card]);

  const text = card ? shareText(card, SITE) : '';
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const canShareImage = !!image && !!nav?.canShare?.({ files: [image.file] });
  const canShareText = !!nav?.share;
  const share = () => {
    // a dismissed share sheet rejects: nothing to say
    nav?.share(canShareImage ? { files: [image!.file], text } : { text }).catch(() => {});
  };
  const save = () => {
    const a = document.createElement('a');
    a.href = image!.url;
    a.download = FILE;
    a.click();
    setNote('Image saved to your downloads.');
  };
  const copy = () => {
    nav?.clipboard?.writeText(text).then(
      () => setNote('Text copied.'),
      () => setNote("Couldn't copy here. Select the text above instead.")
    );
  };

  return (
    <Sheet visible={!!card} onClose={onClose} title="Share this matchday">
      {card ? (
        <View style={styles.body}>
          {image ? (
            <Image source={{ uri: image.url }} style={[styles.image, { aspectRatio: 1080 / cardHeight(card) }]} resizeMode="contain" accessibilityLabel={text} />
          ) : failed ? null : (
            <Skeleton rows={1} height={320} />
          )}
          <Text style={type.footnote} selectable>{text}</Text>
          <View style={styles.actions}>
            {canShareImage || canShareText ? <Button label={canShareImage ? 'Share' : 'Share text'} icon="share-outline" onPress={share} style={styles.action} /> : null}
            {image ? <Button label="Save image" icon="download-outline" kind={canShareImage || canShareText ? 'secondary' : 'primary'} onPress={save} style={styles.action} /> : null}
            <Button label="Copy text" icon="copy-outline" kind="secondary" onPress={copy} style={styles.action} />
          </View>
          <Text style={[type.footnote, styles.note]} accessibilityLiveRegion="polite">{note}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.sm },
  image: { width: '100%', maxWidth: 360, alignSelf: 'center', borderRadius: radius.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flexGrow: 1, minWidth: 132 },
  note: { minHeight: 18 },
});
