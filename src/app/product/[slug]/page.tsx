import '../../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { viewer } from '@/lib/viewer';
import { PRODUCTS, productBySlug } from '@/lib/products';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; const p = productBySlug(slug);
  return p ? { title: p.name, description: p.blurb } : { title: 'Ricorsa' };
}

/** One page per product: what it is, a screen from the app with example content, what you can do with it, and where to go next. */
export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = productBySlug(slug);
  if (!p) notFound();
  const v = await viewer();
  const signup = '/auth/login?screen_hint=signup&returnTo=' + encodeURIComponent(p.open.href.startsWith('/app') ? p.open.href : '/app');
  const openHref = p.open.href.startsWith('mailto:') ? p.open.href : v ? p.open.href : signup;
  const related = p.related.map(productBySlug).filter(Boolean) as typeof PRODUCTS;
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main>
        <section className="prod-hero wrap">
          <div className="kicker">Ricorsa</div>
          <h1>{p.name}</h1>
          <p className="lede">{p.lede}</p>
          <div className="cta">
            <a className="btn primary lg" href={openHref}>{p.open.href.startsWith('mailto:') ? p.open.label : v ? p.open.label : 'Start free'}</a>
            <a className="btn lg" href="/pricing">See plans</a>
          </div>
        </section>
        <div className="prod-shot">
          <figure>
            <img src={`/brand/shots/${p.shot}.png`} alt={p.shotAlt} width={1120} height={700} loading="eager" />
            <figcaption>The app as it looks in use, shown with example content.</figcaption>
          </figure>
        </div>
        <section className="section-c wrap" style={{ borderTop: 0 }}>
          <h2>What you can do with it</h2>
          <div className="prod-points">
            {p.points.map(pt => <div key={pt.title} className="pt"><h3>{pt.title}</h3><p>{pt.text}</p></div>)}
          </div>
        </section>
        <section className="section-c wrap">
          <h2>Worth reading next</h2>
          <div className="prod-related">
            {related.map(r => <a key={r.slug} href={`/product/${r.slug}`}>{r.name}</a>)}
            <a href="/#products">Everything Ricorsa gives you</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
