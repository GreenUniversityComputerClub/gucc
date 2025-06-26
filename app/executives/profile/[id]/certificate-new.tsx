import * as React from "react";

interface CertificateProps {
  name: string;
  position: string;
}

// Utility function to calculate text width (approximate)
const getTextWidth = (text: string, fontSize: number, fontFamily: string): number => {
  // Create a temporary canvas to measure text width
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 0;
    
    context.font = `${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  }
  // Fallback calculation for server-side rendering
  return text.length * fontSize * 0.6;
};

// Function to calculate center position
const getCenterX = (text: string, fontSize: number, fontFamily: string, svgWidth: number = 842): number => {
  const textWidth = getTextWidth(text, fontSize, fontFamily);
  return (svgWidth - textWidth) / 2;
};

const SvgIcon: React.FC<CertificateProps> = (props) => {
  // Calculate center positions for name and position
  const nameCenterX = getCenterX(props.name, 60, 'Pinyon Script');
  const positionCenterX = getCenterX(props.position, 14.5, 'Montserrat');
  
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="842"
      height="595"
      fill="none"
      viewBox="0 0 842 595"
    >
      <path fill="#FFF3E1" d="M0 0h842v595H0z"></path>
      <g opacity="0.05">
        <path
          fill="#161743"
          d="M305.167 146.275s5.708-25.7 12.758-29.6c6.9-3.825 31.192 4.783 31.192 4.783S360.208 97 368.1 95.05c7.367-1.808 27.117 13.617 27.117 13.617s17.008-20.684 25.166-20.734c8.284-.058 25.834 20.734 25.834 20.734s21.466-15.784 29.25-13.65c7.5 2.058 17.541 25.7 17.541 25.7s25.717-9.667 32.784-5.317c6.883 4.242 9.75 30.833 9.75 30.833S562 142.067 567.8 147.65s2.5 32.608 2.5 32.608 26.542 3.75 30.483 10.834c4.167 7.4-7.091 33.141-7.091 33.141s26.716 8.017 29.241 15.95c2.725 8.55-15.766 32.25-15.766 32.25s21.725 13.459 22.15 21.092c.483 8.608-22.15 26.408-22.15 26.408s17 18.867 15.591 26.409c-1.608 8.666-27.591 21.816-27.591 21.816s10.608 23.959 6.733 30.834-30.133 10.275-30.133 10.275 3.133 27.875-3.009 33.675c-5.9 5.575-32.433 1.066-32.433 1.066s-1.017 28.175-8.15 32.609c-7.783 4.833-35.833-7.8-35.833-7.8s-7.767 27.116-15.775 29.6c-8.334 2.583-31.017-16.134-31.017-16.134s-15.642 23.575-24.1 23.75c-8.842.192-26.225-23.75-26.225-23.75s-18.7 17.425-26.233 15.95c-8.775-1.716-21.275-28.733-21.275-28.733s-23.625 10.267-30.484 6.558c-7.383-4-12.05-31.366-12.05-31.366s-25.316 3.683-31.016-1.6c-6.384-5.917-4.425-34.559-4.425-34.559s-25.184-1.533-29.242-7.95c-4.508-7.1 5.833-33.141 5.833-33.141s-24.608-10.742-26.75-18.609c-2.183-8.05 14-30.3 14-30.3S213.067 304.5 212.667 297c-.45-8.458 20.908-26.667 20.908-26.667s-16.283-21.866-14-29.775c2.392-8.233 28.925-18.433 28.925-18.433s-13.467-24.567-9.75-32.083c4.008-8.084 33.85-12.584 33.85-12.584s-4.75-24.758.533-30.125c5.6-5.716 32.034-1.058 32.034-1.058"
        ></path>
      </g>
      
      {/* Name text with dynamic positioning */}
      <text
        xmlSpace="preserve"
        fill="#5D3006"
        fontFamily="Pinyon Script"
        fontSize="60"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x={nameCenterX} y="309.87">
          {props.name}
        </tspan>
      </text>
      
      {/* Position text with dynamic positioning */}
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="14.5"
        fontWeight="bold"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x={positionCenterX} y="368.198">
          {props.position}
        </tspan>
      </text>
      
      {/* Static text elements */}
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="14.5"
        fontWeight="bold"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x="261.219" y="386.198">
          "Green University Computer Club (GUCC)"
        </tspan>
      </text>
      
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="14.5"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x="250.33" y="350.198">
          for outstanding dedication and contribution as
        </tspan>
      </text>
      
      {/* Signature lines and other decorative elements */}
      <path stroke="#000" strokeWidth="0.5" d="M188 489h120"></path>
      <path stroke="#000" strokeWidth="0.5" d="M511 489h120"></path>
      
      {/* Signatures */}
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="14"
        fontWeight="bold"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x="183.244" y="505.519">
          Md. Monirul Islam
        </tspan>
      </text>
      
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="12"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x="153.268" y="522.802">
          Assistant Professor, Dept of CSE
        </tspan>
        <tspan x="196.65" y="537.802">
          Moderator, GUCC
        </tspan>
      </text>
      
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="14"
        fontWeight="bold"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x="447.399" y="505.519">
          Dr. Muhammad Aminur Rahaman
        </tspan>
      </text>
      
      <text
        xmlSpace="preserve"
        fill="#474747"
        fontFamily="Montserrat"
        fontSize="12"
        letterSpacing="0em"
        style={{ whiteSpace: "pre" }}
      >
        <tspan x="534.791" y="522.802">
          Chairperson
        </tspan>
        <tspan x="517.33" y="537.802">
          Dept. of CSE, GUB
        </tspan>
      </text>
    </svg>
  );
};

export default SvgIcon; 