import { SourcePage } from '@/components/SourcePage'

export default function MicrosoftPage(): JSX.Element {
  return (
    <SourcePage
      source="ms-store"
      title="Microsoft Store"
      description="Yüklemeler, aktif cihazlar, rating ve yorumlar — Partner Center Analytics API'sinden günlük çekiliyor."
      setupSteps={[
        'Azure portal\'da yeni bir Entra ID app registration oluştur (Snipotter Admin Cron) ve client secret üret.',
        'Partner Center → Account settings → Tenants altında uygulamaya analytics izni ver.',
        'Cloudflare Workers cron projesinde MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET secret\'larını ekle.',
        'Cron worker\'ı dağıt: cd workers/cron && npx wrangler deploy.',
      ]}
    />
  )
}
