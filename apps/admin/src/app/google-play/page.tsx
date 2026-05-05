import { SourcePage } from '@/components/SourcePage'

export default function GooglePlayPage(): JSX.Element {
  return (
    <SourcePage
      source="play"
      title="Google Play"
      description="Yüklemeler, kaldırmalar, ülke kırılımı, rating ve yorumlar — Play Developer Reporting API'sinden günlük çekiliyor."
      setupSteps={[
        'Google Cloud Console\'da bir proje aç, Play Android Developer API ve Play Developer Reporting API\'lerini etkinleştir.',
        'Service account oluştur, JSON key indir.',
        'Play Console → Users & permissions altında service account\'a "View app info" + "View financial data" izni ver.',
        'JSON key\'i base64 olarak Cloudflare Workers cron secret\'larına PLAY_SERVICE_ACCOUNT_JSON_B64 olarak ekle.',
        'Cron worker\'ı yeniden dağıt; sonraki gece pull başlar.',
      ]}
    />
  )
}
