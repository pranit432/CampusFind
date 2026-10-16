/**
* Template: Orbit (BootstrapMade) - trimmed to the pieces CampusFind uses:
* sticky header state, mobile nav toggle and nav scrollspy.
*/

(function () {
  "use strict";

  const body = document.body;

  /** Add .scrolled to the body once the page is scrolled down. */
  function toggleScrolled() {
    window.scrollY > 100 ? body.classList.add("scrolled") : body.classList.remove("scrolled");
  }
  document.addEventListener("scroll", toggleScrolled);
  window.addEventListener("load", toggleScrolled);

  /** Mobile nav toggle. */
  const mobileNavToggleBtn = document.querySelector(".mobile-nav-toggle");

  function mobileNavToggle() {
    body.classList.toggle("mobile-nav-active");
    mobileNavToggleBtn.classList.toggle("bi-list");
    mobileNavToggleBtn.classList.toggle("bi-x");
  }

  if (mobileNavToggleBtn) {
    mobileNavToggleBtn.addEventListener("click", mobileNavToggle);
  }

  /** Close the mobile nav after a link is tapped. */
  document.querySelectorAll("#navmenu a").forEach((link) => {
    link.addEventListener("click", () => {
      if (body.classList.contains("mobile-nav-active")) mobileNavToggle();
    });
  });

  /** Highlight the nav link of the section currently in view. */
  const navLinks = document.querySelectorAll(".navmenu a");

  function navScrollspy() {
    const position = window.scrollY + 200;
    navLinks.forEach((link) => {
      if (!link.hash) return;
      const section = document.querySelector(link.hash);
      if (!section) return;
      const inView = position >= section.offsetTop && position <= section.offsetTop + section.offsetHeight;
      link.classList.toggle("active", inView);
    });
  }
  window.addEventListener("load", navScrollspy);
  document.addEventListener("scroll", navScrollspy);
})();
