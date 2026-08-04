import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk, Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import StatusBar from "@/components/StatusBar";
import CommandPalette from "@/components/CommandPalette";
import Cursor from "@/components/Cursor";
import ScrollProgress from "@/components/ScrollProgress";
import Grain from "@/components/Grain";
import { siteUrl } from "@/lib/site";
import { profile } from "@content/resume";

const seoTitle = "Sujit Pranav Reddy AI/ML, Python, Ruby on Rails developer";
const seoDescription =
  "Sujit Pranav Reddy is an AI/ML, Python and Ruby on Rails developer with 12+ years in web development and 3+ years in AI/ML development, building web and mobile applications with TensorFlow, PyTorch, LangChain and RAG.";
const socialDescription =
  "Engineering Head and AI/ML, Python, and Ruby on Rails developer in India. 12+ years of web development and 3+ years of AI/ML development, with expertise in architecture, team leadership, TensorFlow, PyTorch, LangChain, RAG, and production SaaS platforms.";

const seoKeywords = [
  "Best AI developer",
  "Best Mobile Application developer",
  "Best Web Application Developer",
  "Best Python Developer",
  "Best Machine Learning developer",
  "TensorFlow",
  "PyTorch",
  "LangChain",
  "RAG",
  "Top 10 developer in India",
  "Best Architect",
  "Best Engineering Head",
  "Best Team leader",
  "AI/ML developer",
  "Artificial Intelligence developer",
  "Machine Learning engineer",
  "Generative AI developer",
  "LLM application developer",
  "RAG developer",
  "Python developer",
  "Ruby on Rails developer",
  "Full Stack developer",
  "Web application developer",
  "Mobile application developer",
  "Software architect",
  "Solutions architect",
  "Engineering leader",
  "Technical team leader",
  "AI platform architect",
  "FastAPI developer",
  "Next.js developer",
  "React developer",
  "AWS developer",
  "SaaS architect",
  "Hyderabad software developer",
  "India software developer",
  "Natural language processing",
  "Recommendation systems",
  "Semantic search",
  "Vector search",
  "Embeddings",
  "Agentic AI",
  "Generative AI",
  "Microservices",
  "Cloud architecture",
  "DevOps",
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: profile.name,
      url: siteUrl,
      jobTitle: "Engineering Head and AI/ML Developer",
      description: socialDescription,
      homeLocation: { "@type": "Place", name: profile.location },
      sameAs: [profile.linkedin, profile.github],
      knowsAbout: [
        "Artificial intelligence",
        "Machine learning",
        "Python",
        "Ruby on Rails",
        "TensorFlow",
        "PyTorch",
        "LangChain",
        "Retrieval-augmented generation (RAG)",
        "Web application development",
        "Mobile application development",
        "Software architecture",
        "Engineering leadership",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: seoTitle,
      description: seoDescription,
      inLanguage: "en-IN",
      publisher: { "@id": `${siteUrl}/#person` },
    },
  ],
};

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--f-display",
  display: "swap",
});
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--f-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--f-mono",
  display: "swap",
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--f-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: seoTitle,
  description: seoDescription,
  keywords: seoKeywords,
  authors: [{ name: profile.name, url: profile.linkedin }],
  creator: profile.name,
  publisher: profile.name,
  category: "technology",
  classification: "AI/ML, Python, Ruby on Rails, web and mobile application development",
  // The site is reachable as both apex and www (nginx 301s www to the apex);
  // the canonical tag makes sure a crawler that arrived on the wrong one still
  // credits a single URL.
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: seoTitle,
    description: socialDescription,
    url: siteUrl,
    siteName: profile.name,
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: seoTitle,
    description: socialDescription,
  },
};

// Apply saved/system theme before first paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} ${serif.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        <Providers>
          <Grain />
          <ScrollProgress />
          <Cursor />
          <StatusBar />
          {children}
          <CommandPalette />
        </Providers>
        {umamiSrc && umamiId && (
          <Script src={umamiSrc} data-website-id={umamiId} strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
