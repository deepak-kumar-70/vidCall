// import logo from "../../Image/logo.png";
const Nav = () => {
  const navItem = [
    "Home",
    "Courses",
    "Admission",
    "Result",
    "Gallery",
    "Contact us",
  ];
  return (
    <div>
      <div className="flex justify-between items-center px-6 pt-2 pb-2 bg-[red] text-white">
        <div className="ml-6 flex items-center">
          <div
            style={{
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              backgroundImage: "linear-gradient(90deg,blue,rgba(255,255,255,0.8),blue)",
            }}
            className="mr-2"
          >
         
          </div>
          <div>
            <div className=" text-xl border-b-[1px] border-b-white ">
             INDRA
            </div>
            <div className="text-[13px]">Enterprises</div>{" "}
          </div>
        </div>
        <div>
          <ul className="flex gap-9 cursor-pointer bg-[red] text-white mr-5 text-[1rem] ">
            {navItem.map((items) => (
              <li
                key={items}
                className="hover:border-b-white border-b-[red] border-b-[1px] pb-1 "
              >
                {items}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Nav;
