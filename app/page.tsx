import Image from "next/image";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.background} aria-hidden="true">
        <Image
          src="/coming-soon/background.png"
          alt=""
          fill
          sizes="100vw"
          preload
          className={styles.backgroundImage}
        />
      </div>

      <div className={styles.content}>
        <header className={styles.header}>
          {/* SVGs externos para conservar los trazados y colores de Figma. */}
          <img
            src="/coming-soon/monogram.svg"
            alt=""
            width={35}
            height={36.908}
            className={styles.monogram}
          />
          <p className={styles.name}>
            ROMANCE<br />WORKS
          </p>
        </header>

        <h1 className={styles.logo}>
          <img
            src="/coming-soon/logo.svg"
            alt="ROMANCE"
            width={1240.13}
            height={217.023}
            className={styles.logoImage}
          />
        </h1>

        <footer className={styles.info}>
          <p>
            <strong>ROMANCE©</strong><br />
            Diseño, tecnología y producto.
          </p>
          <div className={styles.contact}>
            <p><strong>CONTACTO</strong></p>
            <a href="mailto:hola@romanceworks.es">hola@romanceworks.es</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
