import { R, C } from 'rectangles-npm'
import DOMPurify from 'dompurify';
import mockBulletin from '../../mocks/MockBulletin';
import React from 'react'
import {
    RawIcon
} from '../shared/Icon';
function BulletinItem({ I, bulletin }) {
    var config = { ADD_TAGS: ['iframe'], KEEP_CONTENT: false }
    const [edit, setEdit] = React.useState(false);

    React.useEffect(() => setEdit(false), [I.mode]);
    function toggleEdit() { setEdit(!edit) };
    
    function deleteBulletin(id){
        I.deleteBulletin(id);
        setEdit(false);
    }

    return (
        <R l bb s={bulletin.height} theme={edit ? "brick" : I.theme} >
            {edit ?
                <C
                onClick={()=>deleteBulletin(bulletin._id)}
                    t br h ha="center" p={"0px"} s={"30px"}>
                    <i style={{ color: "pink" }} className={"fa fa-trash font-weight-bold"}></i>
                </C> :
                <C s={"0px"}></C>
            }
            <R t ns tel h dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bulletin.html, config) }} />
            {I.mode === "bulletin-edit" ?
                <C onClick={toggleEdit} t bl h ha="center" p={"0px"} s={"30px"}>
                    <i style={{ color: "yellow" }} className={"fa fa-pencil font-weight-bold"}></i>
                </C> :
                <C s={"0px"}></C>
            }

        </R>
    )
}

function Bulletin({ I }) {
    const BulletinItems = I.bulletin.map(
        (bulletin, index) => <BulletinItem key={index} I={I} bulletin={bulletin}></BulletinItem>
    )
    return (
        <R t theme={I.theme}>
            {BulletinItems}
        </R>
    )
}

export default Bulletin;