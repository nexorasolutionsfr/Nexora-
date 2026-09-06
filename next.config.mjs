/** @type {import('next').NextConfig} */
const nextConfig = {
  // Le rond noir en bas à gauche est l'indicateur de développement de Next.js.
  // Il n'apparaît QUE sur `next dev` — vérifié sur nexora-garage.vercel.app :
  // aucun élément fixe de ce genre, aucun `nextjs-portal`. Il ne vient donc pas
  // de Vercel et n'a jamais été vu par un garage.
  //
  // On le coupe quand même : il se superpose aux écrans qu'on montre en
  // préversion, et une capture d'écran avec un badge de développement dessus
  // n'est pas montrable.
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
