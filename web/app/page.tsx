// proxy.ts redirects every request for "/" by session, so this never renders.
export default function Home() {
  return null;
}
