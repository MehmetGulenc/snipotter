import { SourcePage } from '@/components/SourcePage'

export default function GithubPage(): JSX.Element {
  return (
    <SourcePage
      source="github"
      title="GitHub Releases"
      description="Doğrudan indirilen .dmg / .exe / .AppImage dosyalarının indirilme sayıları — GitHub'ın public assets API'sinden saatte bir çekiliyor."
      setupSteps={[
        'Cron worker\'ın github puller\'ı zaten anonim API kullanır (saat başı 60 istek limit). Limit yetmezse:',
        'GitHub kişisel access token üret (read-only public repo izni yeter).',
        'Cloudflare Workers cron secret\'larına GITHUB_TOKEN olarak ekle.',
        'Limit 5000/saat\'e çıkar — fazlasıyla yeterli.',
      ]}
    />
  )
}
