import Link from "next/link"
import { Facebook, Linkedin, Mail } from "lucide-react"
import Image from "next/image"

export function Footer() {
  return (
    <footer className="w-full border-t bg-background">
      <div className="container py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Image
                src="/android-chrome-512x512.png"
                alt="GUCC Logo"
                width={48}
                height={48}
                className="h-12 w-auto"
              />
              <h3 className="text-lg font-semibold">Green University Computer Club</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              A dynamic and student-driven non-profit and non-political organization operating in collaboration with the
              Department of Computer Science and Engineering (CSE) at Green University of Bangladesh.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/events" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Events
                </Link>
              </li>
              <li>
                <Link href="/executives" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Executives
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Green University of Bangladesh, Begum Rokeya Avenue, Dhaka-1207
              </p>
              <p className="text-sm text-muted-foreground">Email: gucc@green.edu.bd</p>
              <div className="flex space-x-4 mt-4">
                <Link
                  href="https://www.facebook.com/GreenUniversityComputerClub/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <Facebook size={20} />
                </Link>
 
                <Link
                  href="https://www.linkedin.com/company/greenuniversitycomputerclub/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <Linkedin size={20} />
                </Link>
                <Link
                  href="mailto:gucc@green.edu.bd"
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail size={20} />
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Green University Computer Club. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

